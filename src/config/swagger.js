// =======================================
// 📄 Swagger Configuration
// =======================================

const swaggerJsDoc = require("swagger-jsdoc");

// Define the main configuration options for Swagger.
const options = {
  // `definition` contains the core OpenAPI specification details.
  definition: {
    // Specifies the OpenAPI version being used. "3.0.0" is a modern standard.
    openapi: "3.0.0",
    // `info` provides metadata about the API.
    info: {
      title: "FinFlow API", // The title of the API, displayed prominently in Swagger UI.
      version: "1.0.0", // The version of the API.
      description: "API documentation for FinFlow backend", // A short description of the API.
    },
    // `servers` defines the base URL(s) for the API.
    servers: [
      {
        url: "http://localhost:3000", // The base URL for local development. All API paths will be relative to this.
      },
    ],
    // `components` allows defining reusable parts of the specification, like security schemes.
    components: {
      // `securitySchemes` defines the authentication methods the API supports.
      securitySchemes: {
        // We are defining a scheme named 'bearerAuth' for JWT authentication.
        bearerAuth: {
          type: "http", // The type of security scheme. 'http' is used for Bearer tokens.
          scheme: "bearer", // The scheme to be used. For JWT, this is 'bearer'.
          bearerFormat: "JWT", // A hint to the client about the format of the bearer token.
        },
      },
    },

    // `security` applies a security scheme globally to all API endpoints.
    security: [
      {
        // This applies the 'bearerAuth' scheme defined above to all routes.
        // This enables the "Authorize" button in Swagger UI for testing protected routes.
        bearerAuth: [],
      },
    ],
  },
  // `apis` is an array of file paths where swagger-jsdoc will look for JSDoc comments.
  // It will scan all .js files inside the 'src/routes' directory and its subdirectories.
  apis: ["./src/routes/**/*.js"],
};

// Generate the final Swagger specification object by passing the options to swagger-jsdoc.
const swaggerSpec = swaggerJsDoc(options);

// Export the generated specification so it can be used by swagger-ui-express in index.js.
module.exports = swaggerSpec;
