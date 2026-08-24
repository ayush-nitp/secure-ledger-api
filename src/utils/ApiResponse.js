class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400; // 400 se kam (e.g., 200, 201) matlab success true
    }
}

module.exports = ApiResponse;