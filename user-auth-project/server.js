const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("../swagger");

require("dotenv").config();

const app = express();
const PORT = 5432;

app.use(express.json());

// MONGODB ULANISH
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB ulandi ✅");
    })
    .catch((error) => {
        console.log("MongoDB ulanishda xato ❌");
        console.log(error);
    });

// SCHEMA
const userSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
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
    password: { type: String, required: true }
});

const User = mongoose.model("User", userSchema);

// SWAGGER
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// REGISTER
app.post("/register", async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.status(201).json({ message: "User yaratildi ✅", user });
    } catch (error) {
        res.status(500).json({ message: "User yaratishda xato", error: error.message });
    }
});

// LOGIN
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: "Username yoki passwordni kiriting" });
        }
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(401).json({ message: "Username yoki password noto‘g‘ri" });
        }
        const accessToken = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        res.status(200).json({ message: "Login muvaffaqiyatli ✅", accessToken });
    } catch (error) {
        res.status(500).json({ message: "Login xatosi", error: error.message });
    }
});

// JWT MIDDLEWARE
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Authorization token mavjud emas" });
    
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token noto‘g‘ri formatda" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Token noto‘g‘ri yoki muddati tugagan" });
    }
}

// ME
app.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.id }).select("-password");
        if (!user) return res.status(404).json({ message: "User topilmadi" });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: "Xatolik", error: error.message });
    }
});

// ALL USERS
app.get("/users", async (req, res) => {
    try {
        const users = await User.find().select("-password");
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Userlarni olishda xato", error: error.message });
    }
});

// SERVER
app.listen(PORT, () => {
    console.log(`Project running: http://localhost:${PORT}`);
    console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);
});