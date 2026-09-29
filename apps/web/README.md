# JobPlatform Frontend

A modern, responsive job platform frontend built with Next.js 15, React 19, and Tailwind CSS. This application provides a comprehensive job search and posting experience for both job seekers and employers.

## 🚀 Features

### For Job Seekers
- **Smart Job Search**: Advanced search with filters for location, job type, salary, and more
- **Job Listings**: Browse through detailed job postings with company information
- **Save Jobs**: Bookmark interesting positions for later review
- **User Profiles**: Create and manage your professional profile
- **Application Tracking**: Monitor your job applications and their status

### For Employers
- **Job Posting**: Create detailed job listings with requirements and benefits
- **Candidate Management**: Review and manage job applications
- **Company Profiles**: Showcase your company and culture
- **Analytics**: Track job posting performance and candidate engagement

### Technical Features
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Type Safety**: Full TypeScript implementation
- **Form Validation**: React Hook Form with comprehensive validation
- **State Management**: Efficient state management with React hooks
- **API Integration**: Axios-based API client with interceptors
- **Authentication**: JWT-based authentication system
- **File Uploads**: Support for profile photos and resumes

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with App Router
- **React**: React 19 with modern hooks
- **Styling**: Tailwind CSS 4
- **Forms**: React Hook Form
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **TypeScript**: Full type safety
- **Build Tool**: Turbopack (dev mode)

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout with navigation
│   ├── page.tsx           # Homepage
│   ├── login/             # Authentication pages
│   ├── register/          # User registration
│   ├── jobs/              # Job listings and search
│   └── post-job/          # Job posting form
├── components/             # Reusable UI components
│   └── Navbar.tsx         # Navigation component
├── types/                  # TypeScript type definitions
│   └── index.ts           # Main type definitions
└── utils/                  # Utility functions
    └── api.ts             # API client and helpers
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd job-platform-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## 🌐 API Integration

The frontend is designed to work with the JobPlatform backend API. Key endpoints include:

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/forgot-password` - Password reset request
- `POST /auth/reset-password` - Password reset
- `GET /auth/verify-email` - Email verification

### Jobs
- `GET /jobs` - Fetch job listings
- `POST /jobs` - Create new job posting
- `GET /jobs/:id` - Get job details
- `PUT /jobs/:id` - Update job posting
- `DELETE /jobs/:id` - Delete job posting

### Applications
- `POST /jobs/:id/apply` - Apply for a job
- `GET /applications` - Get user applications
- `GET /jobs/:id/applications` - Get job applications (employers)

## 🎨 UI Components

### Navigation
- Responsive navbar with mobile menu
- User authentication state management
- Role-based navigation (jobseeker/employer)

### Forms
- **Login Form**: Email/password authentication
- **Registration Form**: User account creation with role selection
- **Job Posting Form**: Comprehensive job creation with dynamic fields

### Job Listings
- Search and filter functionality
- Responsive job cards with company information
- Save/bookmark functionality
- Pagination support

## 🔐 Authentication Flow

1. **Registration**: Users can register as job seekers or employers
2. **Email Verification**: Email verification required for account activation
3. **Login**: JWT-based authentication with token storage
4. **Protected Routes**: Role-based access control
5. **Token Management**: Automatic token refresh and expiration handling

## 📱 Responsive Design

- **Mobile First**: Optimized for mobile devices
- **Breakpoints**: Responsive design across all screen sizes
- **Touch Friendly**: Optimized for touch interactions
- **Accessibility**: WCAG compliant with proper ARIA labels

## 🧪 Development

### Code Style
- ESLint configuration for code quality
- Prettier for code formatting
- TypeScript strict mode enabled

### State Management
- React hooks for local state
- Context API for global state (if needed)
- Efficient re-rendering with proper dependencies

### Performance
- Next.js optimizations
- Image optimization
- Code splitting and lazy loading
- Bundle analysis tools

## 🚀 Deployment

### Production Build
```bash
npm run build
npm run start
```

### Environment Variables
Ensure all required environment variables are set in production:
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXTAUTH_SECRET` - Authentication secret (if using NextAuth)

### Deployment Platforms
- **Vercel**: Recommended for Next.js applications
- **Netlify**: Alternative deployment option
- **Docker**: Containerized deployment support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the code examples

## 🔮 Future Enhancements

- **Real-time Notifications**: WebSocket integration for instant updates
- **Advanced Search**: AI-powered job matching
- **Analytics Dashboard**: Employer insights and metrics
- **Mobile App**: React Native companion app
- **Multi-language Support**: Internationalization (i18n)
- **Dark Mode**: Theme switching capability

---

Built with ❤️ by the JobPlatform Team
