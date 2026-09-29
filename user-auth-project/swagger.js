const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "User Auth API",
    version: "1.0.0",
    description: "Backend API hujjati",
  },
  servers: [
    {
      url: "http://localhost:5432",
    },
  ],
  paths: {
    "/register": {
      post: {
        summary: "Ro'yxatdan o'tish",
        responses: { 201: { description: "Muvaffaqiyatli" } }
      }
    },
    "/login": {
      post: {
        summary: "Tizimga kirish",
        responses: { 200: { description: "Muvaffaqiyatli" } }
      }
    }
  }
};

module.exports = swaggerDocument;