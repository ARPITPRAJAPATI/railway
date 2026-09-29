# 🚆 Railway Microservices — Complete Architecture & Code Learnings

Yeh document hamare poore microservices codebase ki file-by-file learnings aur architectural decisions ka master log hai.

---

## 📑 Index of Services:
1. **User Service** (Authentication, OAuth, OTP, JWT, Device Fingerprinting)
2. **Notification Service** (Kafka Consumer, Email Templates via SendGrid)
3. **API Gateway** (Circuit Breakers, Reverse Proxy, Sliding Window Rate Limiting, Route Mapping)
4. **Admin Service** (Stations, Trains, Routes, Schedules, Atomic Writes)
5. **Search Service** (Search Engine, Route Matching, In-Memory Caching)

---

## 📦 1. USER SERVICE

### File 1: `user-service/prisma/schema.prisma`
* **Purpose:** Database Models for User Identity & Multi-Provider Authentication.
* **Core Learnings:**
  1. **UUID over Auto-Increment ID (`@default(uuid())`):** Distributed microservices me auto-increment ID (`1, 2, 3...`) use karne se ID enumeration attack ho sakta hai aur multi-database merge mushkil hota hai. UUID globally unique aur secure hota hai.
  2. **Account Linking Architecture (`User` + `AuthProvider`):** 
     - Google OAuth aur Email/Password ko ek hi `User` table me mix nahi kiya gaya.
     - `User` table me core identity (email, name) rehti hai. `password` nullable (`String?`) hai kyunki Google login wale user ke paas local password nahi hota.
     - `AuthProvider` table third-party logins (Google, GitHub) track karti hai.
  3. **Compound Unique Constraints (`@@unique`):**
     - `@@unique([provider, providerId])`: Ek Google Account ID se do users nahi ban sakte.
     - `@@unique([userId, provider])`: Ek user ek provider ko sirf ek hi baar link kar sakta hai.
     - `@@unique([userId])`: 1-to-1 strict relationship enforcement.
