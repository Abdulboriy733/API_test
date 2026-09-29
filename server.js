const dns = require("dns");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger");

require("dotenv").config();

// Node o'zining DNS resolverini Windows/VPN sozlamalaridan
// mustaqil ravishda Google DNS'ga majburan yo'naltiradi.
// Bu "querySrv ECONNREFUSED" xatosining eng ishonchli yechimi.
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const app = express();
const PORT = process.env.PORT || 5432;

// Frontend (localhost:5173) backend (localhost:5432) bilan
// gaplasha olishi uchun CORS ruxsati
app.use(cors());

app.use(express.json());


// ======================================
// MONGODB ULANISH
// ======================================

// Ulanish vaqti-vaqti bilan xato bersa (DNS, tarmoq yoki VPN
// o'zgarishi), server ishlab turib qoladi-yu, so'rovlar
// DB ga yetib bormaydi. Shuning uchun qayta urinishlarni
// avtomatik davom ettiramiz.

async function connectToMongo(attempt = 1) {

    try {

        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 12000,
            connectTimeoutMS: 12000
        });

        console.log("MongoDB ulandi ✅");

    } catch (error) {

        console.log(`MongoDB ulanishda xato ❌ (urinish ${attempt}): ${error.message}`);
        console.log("5 soniyadan so'ng qayta uriniladi...");

        setTimeout(() => connectToMongo(attempt + 1), 5000);

    }

}


mongoose.connection.on("disconnected", () => {

    console.log("MongoDB uzildi ❌ — qayta ulanishga uriniladi...");

    setTimeout(() => connectToMongo(1), 5000);

});


connectToMongo();


// ======================================
// SCHEMA
// ======================================

const userSchema = new mongoose.Schema({

    id: {
        type: Number,
        unique: true
    },

    username: {
        type: String,
        required: true,
        unique: true
    },

    fullName: {
        type: String,
        required: true
    },

    firstName: String,

    lastName: String,

    middleName: String,

    birthDate: String,

    gender: String,

    country: String,

    region: String,

    district: String,

    address: String,

    phone: String,

    email: String,

    passport: {
        series: String,
        number: String,
        issuedBy: String,
        issuedDate: String
    },

    age: Number,

    registeredAt: String,

    password: {
        type: String,
        required: true
    }

});


// ======================================
// MODEL
// ======================================

const User = mongoose.model("User", userSchema);


// ======================================
// SWAGGER
// ======================================

app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument)
);


// ======================================
// REGISTER
// ======================================

/**
 * @openapi
 * /register:
 *   post:
 *     summary: Yangi user ro'yxatdan o'tkazish
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               fullName:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User yaratildi
 *       409:
 *         description: Username band
 */
app.post("/register", async (req, res) => {

    try {

        // 1) Username band emasligini tekshiramiz
        const existingUser = await User.findOne({
            username: req.body.username
        });

        if (existingUser) {

            return res.status(409).json({
                message: "Bu username band"
            });

        }

        // 2) id yuborilmagan bo'lsa, o'zimiz avtomatik beramiz
        const lastUser = await User.findOne().sort({ id: -1 });
        const nextId = lastUser && lastUser.id ? lastUser.id + 1 : 1;

        // 3) Parolni hash qilamiz — hech qachon plain text saqlamaymiz
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        const user = await User.create({
            ...req.body,
            id: req.body.id || nextId,
            password: hashedPassword
        });

        const { password, ...userWithoutPassword } = user.toObject();

        res.status(201).json({
            message: "User yaratildi ✅",
            user: userWithoutPassword
        });

    } catch (error) {

        res.status(500).json({
            message: "User yaratishda xato",
            error: error.message
        });

    }

});


// ======================================
// LOGIN
// ======================================

/**
 * @openapi
 * /login:
 *   post:
 *     summary: Login qilish va accessToken olish
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: accessToken qaytaradi
 *       401:
 *         description: Username yoki parol xato
 */
app.post("/login", async (req, res) => {

    try {

        const { username, password } = req.body;


        if (!username || !password) {

            return res.status(400).json({
                message: "Username yoki passwordni kiriting"
            });

        }


        // MongoDB'dan user qidiramiz

        const user = await User.findOne({
            username: username
        });


        if (!user) {

            return res.status(401).json({
                message: "Username yoki password noto‘g‘ri"
            });

        }


        // Password tekshirish — hash bilan solishtiramiz, oddiy === bilan emas

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {

            return res.status(401).json({
                message: "Username yoki password noto‘g‘ri"
            });

        }


        // JWT yaratamiz

        const accessToken = jwt.sign(

            {
                id: user.id,
                username: user.username
            },

            process.env.JWT_SECRET,

            {
                expiresIn: "1h"
            }

        );


        res.status(200).json({

            message: "Login muvaffaqiyatli ✅",

            accessToken

        });

    } catch (error) {

        res.status(500).json({

            message: "Login xatosi",

            error: error.message

        });

    }

});


// ======================================
// JWT MIDDLEWARE
// ======================================

function authMiddleware(req, res, next) {

    const authHeader = req.headers.authorization;


    if (!authHeader) {

        return res.status(401).json({

            message: "Authorization token mavjud emas"

        });

    }


    const token = authHeader.split(" ")[1];


    if (!token) {

        return res.status(401).json({

            message: "Token noto‘g‘ri formatda"

        });

    }


    try {

        const decoded = jwt.verify(

            token,

            process.env.JWT_SECRET

        );


        req.user = decoded;


        next();

    } catch (error) {

        return res.status(401).json({

            message: "Token noto‘g‘ri yoki muddati tugagan"

        });

    }

}


// ======================================
// ME
// ======================================

/**
 * @openapi
 * /me:
 *   get:
 *     summary: Login qilgan userning ma'lumotlarini olish
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User ma'lumotlari
 *       401:
 *         description: Token noto'g'ri yoki yo'q
 */
app.get("/me", authMiddleware, async (req, res) => {

    try {

        const user = await User.findOne({
            id: req.user.id
        }).select("-password");


        if (!user) {

            return res.status(404).json({

                message: "User topilmadi"

            });

        }


        res.status(200).json(user);

    } catch (error) {

        res.status(500).json({

            message: "Xatolik",

            error: error.message

        });

    }

});


// ======================================
// ALL USERS (endi JWT bilan himoyalangan)
// ======================================

/**
 * @openapi
 * /users:
 *   get:
 *     summary: Barcha userlar ro'yxati
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Userlar ro'yxati
 *       401:
 *         description: Token noto'g'ri yoki yo'q
 */
app.get("/users", authMiddleware, async (req, res) => {

    try {

        const users = await User
            .find()
            .select("-password");


        res.status(200).json(users);

    } catch (error) {

        res.status(500).json({

            message: "Userlarni olishda xato",

            error: error.message

        });

    }

});


// ======================================
// SERVER
// ======================================

app.listen(PORT, () => {

    console.log(
        `Project running: http://localhost:${PORT}`
    );

    console.log(
        `Swagger docs: http://localhost:${PORT}/api-docs`
    );

});