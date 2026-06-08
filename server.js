import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { body, validationResult } from 'express-validator';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5820;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '94771234567';


//cloudflare connection

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
  fileFilter: (req, file, cb) => {
    // Security: Only allow image mimetypes
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed!'), false);
    }
  }
});

// Helper to upload to Cloudflare R2
async function uploadToR2(file) {
  if (!file) return null;
  
  const fileExtension = path.extname(file.originalname);
  const fileName = `products/${crypto.randomBytes(8).toString('hex')}-${Date.now()}${fileExtension}`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);
  // Returns the public URL for the stored image
  return `${process.env.R2_PUBLIC_URL}/${fileName}`;
}

// Helper to delete from Cloudflare R2
async function deleteFromR2(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith(process.env.R2_PUBLIC_URL)) return;

  const key = imageUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });

  try {
    await s3.send(command);
  } catch (err) {
    console.error('R2 Deletion Error:', err);
  }
}

// Database Connection Pool
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const categories = ['Engine', 'Brakes', 'Lighting', 'Suspension', 'Filters', 'Tyres', 'Accessories'];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security: Set security HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "https://images.unsplash.com", process.env.R2_PUBLIC_URL],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Security: Hardened Cookies
app.use(cookieParser(process.env.COOKIE_SECRET));

// Security: Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function money(value) {
  return 'Rs. ' + Number(value).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Helper to map DB columns to EJS view expected keys
function mapProduct(row) {
  if (!row) return null;
  
  // Handle migration from single 'image' to 'images' array
  let imagesArr = [];
  if (Array.isArray(row.images)) {
    imagesArr = row.images;
  } else if (row.image) {
    imagesArr = [row.image];
  }

  const images = imagesArr.map(img => {
    if (img && !img.includes('://') && !img.startsWith('/')) return '/' + img;
    return img;
  });

  return {
    ...row,
    images: images.length > 0 ? images : ['/images/placeholder.png'],
    image: images[0] || '/images/placeholder.png', // Backward compatibility for single-image views
    originalPrice: row.original_price ? Number(row.original_price) : 0,
    price: Number(row.price)
  };
}

function isAdminAuthenticated(req) {
  // Security: Check signed cookies
  return req.signedCookies.gearhubAdmin === ADMIN_TOKEN;
}

function requireAdmin(req, res, next) {
  if (isAdminAuthenticated(req)) {
    return next();
  }

  return res.redirect('/admin/login');
}

// Security: CSRF Mitigation Middleware
function csrfProtection(req, res, next) {
  const origin = req.get('origin');
  const referer = req.get('referer'); // Fallback for standard form submissions
  const host = req.get('host');
  
  // For state-changing methods, ensure the request comes from the same origin
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const source = origin || referer;

    if (!source || !source.includes(host)) {
      // Log details to terminal to help you debug local host vs IP issues
      console.warn('CSRF Security Check Failed:', {
        method: req.method,
        path: req.path,
        origin: origin || 'missing',
        referer: referer || 'missing',
        host: host
      });
      return res.status(403).send('Security check failed: Invalid origin.');
    }
  }
  next();
}

// Security: Validation Rules for Products
const productValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('category').isIn(categories),
  body('vehicle').trim().isLength({ min: 2, max: 100 }).escape(),
  body('originalPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('sellingPrice').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 }),
  body('description').trim().isLength({ min: 10 }).escape()
];

function whatsappLink(product) {
  const message = `Hello GearHub, I want to order ${product.name} for ${product.vehicle}. Selling Price: ${money(product.price)}.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

app.locals.money = money;
app.locals.categories = categories;
app.locals.whatsappLink = whatsappLink;

app.get('/', (req, res) => {
  res.render('index', {
    title: 'GearHub Auto Parts | Professional Vehicle Solutions'
  });
});

app.get('/shop', async (req, res) => {
  const selectedCategory = req.query.category || 'All';
  const search = (req.query.search || '').trim().toLowerCase();

  try {
    const query = `
      SELECT * FROM products 
      WHERE ($1::text = 'All' OR category = $1)
      AND (name ILIKE $2 OR vehicle ILIKE $2 OR COALESCE(description, '') ILIKE $2)
      ORDER BY id DESC
    `;
    const values = [selectedCategory, `%${search}%`];
    const result = await pool.query(query, values);
    const mappedProducts = result.rows.map(mapProduct);

    res.render('shop', {
      title: 'Shop Parts - GearHub',
      products: mappedProducts,
      selectedCategory,
      search: req.query.search || ''
    });
  } catch (err) {
    console.error('Database Error in /shop:', err.message);
    res.status(500).send('Database Error');
  }
});

app.get('/product/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = mapProduct(result.rows[0]);

    if (!product) {
      return res.status(404).render('not-found', { title: 'Product Not Found' });
    }

    res.render('product', { title: product.name, product });
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

app.get('/admin/login', (req, res) => {
  if (isAdminAuthenticated(req)) {
    return res.redirect('/admin');
  }

  return res.render('login', {
    title: 'Admin Login',
    error: req.query.error === '1'
  });
});

// Security: Specifically limit login attempts to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, 
  message: 'Too many login attempts, please try again later.'
});

app.post('/admin/login', loginLimiter, (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.redirect('/admin/login?error=1');
  }

  // Security: Use express cookie helper for hardened signed cookie
  res.cookie('gearhubAdmin', ADMIN_TOKEN, {
    httpOnly: true,
    signed: true,
    sameSite: 'Lax',
    path: '/admin',
    maxAge: 7200000,
    secure: process.env.NODE_ENV === 'production'
  });
  return res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie('gearhubAdmin', { path: '/admin' });
  return res.redirect('/');
});

app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.render('admin', {
      title: 'Admin Dashboard',
      products: result.rows.map(mapProduct),
      editingProduct: null
    });
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

app.get('/admin/edit/:id', requireAdmin, async (req, res) => {
  try {
    const productsRes = await pool.query('SELECT * FROM products ORDER BY id DESC');
    const productRes = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const editingProduct = mapProduct(productRes.rows[0]);

    if (!editingProduct) {
      return res.status(404).render('not-found', { title: 'Product Not Found' });
    }

    res.render('admin', {
      title: 'Edit Product',
      products: productsRes.rows.map(mapProduct),
      editingProduct
    });
  } catch (err) {
    res.status(500).send('Database Error');
  }
});

app.post('/admin/products', requireAdmin, csrfProtection, upload.array('images', 3), productValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Log detailed errors to console for the developer
    console.warn('Validation Errors (Add):', errors.array());
    // Send specific field errors back to the UI
    const detailedErrors = errors.array().map(e => `${e.path}: ${e.msg}`).join(', ');
    return res.status(400).send(`Invalid input data provided. Please check: ${detailedErrors}`);
  }

  try {
    const { name, category, vehicle, originalPrice, sellingPrice, stock, description } = req.body;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).send('At least one product image is required.');
    }

    // Upload images to R2 and get URLs
    const imagePromises = req.files.map(file => uploadToR2(file));
    const imageUrls = await Promise.all(imagePromises);

    const query = `
      INSERT INTO products (name, category, vehicle, original_price, price, stock, images, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const values = [
      name, 
      category, 
      vehicle, 
      Number(originalPrice) || 0, 
      Number(sellingPrice), 
      Number(stock), 
      imageUrls, 
      description
    ];
    
    await pool.query(query, values);
    res.redirect('/admin');
  } catch (err) {
    console.error('Insert Error:', err);
    res.status(500).send('Database Error');
  }
});

app.post('/admin/products/:id/update', requireAdmin, csrfProtection, upload.array('images', 3), productValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Log detailed errors to console for the developer
    console.warn('Validation Errors (Update):', errors.array());
    // Send specific field errors back to the UI
    const detailedErrors = errors.array().map(e => `${e.path}: ${e.msg}`).join(', ');
    return res.status(400).send(`Invalid input data provided. Please check: ${detailedErrors}`);
  }

  try {
    const { name, category, vehicle, originalPrice, sellingPrice, stock, description } = req.body;
    
    // If new files were uploaded, process them
    let imageUrls = null;
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(file => uploadToR2(file));
      imageUrls = await Promise.all(imagePromises);
    }

    const query = `
      UPDATE products 
      SET name = $1, category = $2, vehicle = $3, original_price = $4, price = $5, stock = $6, 
          description = $7, images = COALESCE($8, images)
      WHERE id = $9
    `;
    const values = [
      name, 
      category, 
      vehicle, 
      Number(originalPrice) || 0, 
      Number(sellingPrice), 
      Number(stock), 
      description,
      imageUrls, // Will be null if no new files, COALESCE handles keeping the old ones
      req.params.id
    ];

    await pool.query(query, values);
    res.redirect('/admin');
  } catch (err) {
    console.error('Update Error:', err);
    res.status(500).send('Database Error');
  }
});

app.post('/admin/products/:id/delete', requireAdmin, csrfProtection, async (req, res) => {
  try {
    // 1. Fetch the product's image URLs before deleting the record
    const result = await pool.query('SELECT images FROM products WHERE id = $1', [req.params.id]);
    const imageUrls = result.rows[0]?.images;

    // 2. Delete the record from the database
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);

    // 3. If images exist and are stored on R2, delete them
    if (Array.isArray(imageUrls)) {
      for (const url of imageUrls) {
        await deleteFromR2(url);
      }
    }

    res.redirect('/admin');
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).send('Database Error');
  }
});
app.listen(PORT, () => {
  console.log(`Vehicle parts ecommerce app running at http://localhost:${PORT}`);
});
