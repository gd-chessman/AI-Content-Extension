# Dự Án Mẫu NestJS

Dự án mẫu NestJS với cấu trúc chuẩn và hỗ trợ đa cơ sở dữ liệu (MongoDB và PostgreSQL).

## 🌟 Các nhánh dự án

- **`nest-mongodb`**: Hỗ trợ cơ sở dữ liệu MongoDB
- **`nest-postgresql`**: Hỗ trợ cơ sở dữ liệu PostgreSQL

## 📁 Cấu trúc dự án

```
src/
├── config/                   # Configuration files
│   ├── app.config.ts        # App configuration
│   └── database.config.ts   # Database configuration
├── exceptions/              # Custom exception classes
├── middleware/              # Custom middleware
│   ├── logger.middleware.ts # Logging middleware
│   └── rate-limiter.middleware.ts # Rate limiting middleware
├── modules/                 # Feature modules
│   └── index.txt           # Module index file
├── shared/                  # Shared utilities and services
│   ├── cache/              # Caching utilities
│   ├── cloudinary/         # Cloudinary integration
│   ├── mail/               # Email services
│   └── shared.module.ts    # Shared module
├── app.controller.spec.ts   # App controller tests
├── app.controller.ts        # Main application controller
├── app.module.ts           # Root module
├── app.service.ts          # Main application service
└── main.ts                 # Application entry point

# Root level files
├── .env.example            # Environment variables example
├── .eslintrc.js           # ESLint configuration
├── .gitignore             # Git ignore rules
├── .prettierrc            # Prettier configuration
├── nest-cli.json          # Nest CLI configuration
├── package.json           # Node.js dependencies
├── README.md              # Project documentation
├── tsconfig.build.json    # TypeScript build config
├── tsconfig.json          # TypeScript configuration
└── yarn.lock              # Yarn lock file
```

## 🗄️ Cơ sở dữ liệu

### MongoDB (nhánh: `nest-mongodb`)
- Sử dụng Mongoose để kết nối MongoDB
- Cấu hình trong `config/database.config.ts`

### PostgreSQL (nhánh: `nest-postgresql`)
- Sử dụng TypeORM để kết nối PostgreSQL
- Cấu hình trong `config/database.config.ts`

## 🚀 Cách sử dụng

1. **Chọn nhánh phù hợp:**
```bash
# Cho MongoDB
git checkout nest-mongodb

# Hoặc cho PostgreSQL
git checkout nest-postgresql
```

2. **Cài đặt và chạy:**
```bash
npm install
npm run dev
```

---

**Lưu ý**: Đảm bảo chọn đúng nhánh (`nest-mongodb` hoặc `nest-postgresql`) phù hợp với cơ sở dữ liệu bạn muốn sử dụng.
