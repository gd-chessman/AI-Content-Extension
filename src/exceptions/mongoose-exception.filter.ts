import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import mongoose from 'mongoose';

@Catch(mongoose.Error.ValidationError, mongoose.mongo.MongoServerError)
export class MongooseExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof mongoose.Error.ValidationError) {
      // Xử lý lỗi Validation của Mongoose
      const errors = Object.values(exception.errors).map((err: any) => ({
        field: err.path,
        message: err.message,
      }));

      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors,
      });
    }

    if (exception.code === 11000) {
      // Xử lý lỗi Duplicate Key (E11000)
      const keyValue = exception.keyValue; // Lấy thông tin key bị trùng
      const field = Object.keys(keyValue)[0]; // Lấy tên trường bị trùng
      const value = keyValue[field]; // Giá trị bị trùng

      return response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: `Dữ liệu đã tồn tại!`,
        field,
        value,
      });
    }

    // Nếu lỗi không phải từ Mongoose, trả về lỗi mặc định
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
