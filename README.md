# 🚆 High-Concurrency Railway Reservation System (IRCTC Backend)

> An enterprise-grade, event-driven microservices backend designed to handle high-concurrency train discovery, reservations, and notifications — architected with Node.js, Express, Apache Kafka, Redis, PostgreSQL (Prisma), and Docker.

---

## 🏛️ System Architecture

```
                                  +-----------------------+
                                  |      Client / Web     |
                                  +-----------+-----------+
                                              |
                                              v  [HTTP / Port 4000]
                     +-------------------------------------------------+
                     |                   API GATEWAY                   |
                     |  - Reverse Proxy (forwardRequest)               |
                     |  - Circuit Breakers (userService, search, etc.) |
                     |  - Redis Sliding-Window Rate Limiters           |
                     |  - JWT Auth Extraction & Header Injection       |
                     +-------+-----------------+-----------------+-----+
                             |                 |                 |
            +----------------+                 |                 +----------------+
            | [HTTP]                           | [HTTP]                           | [HTTP]
            v                                  v                                  v
+-----------------------+          +-----------------------+          +-----------------------+
|     USER SERVICE      |          |     ADMIN SERVICE     |          |    SEARCH SERVICE     |
|      (Port 4001)      |          |      (Port 4002)      |          |      (Port 4003)      |
|-----------------------|          |-----------------------|          |-----------------------|
| - Email + OTP Flow    |          | - Train CRUD          |          | - Train Search Engine |
| - Google OAuth 2.0    |          | - Station Management  |          | - Route Autocomplete  |
| - Token Rotation      |          | - Multi-stop Routes   |          | - Cache-Aside / Index |
| - Device Fingerprint  |          | - Train Schedules     |          | - Kafka Consumer      |
| - Redis Cache-Aside   |          | - Atomic Nested Writes|          |                       |
+-----------+-----------+          +-----------+-----------+          +-----------+-----------+
            |                                  |                                  ^
            | [Pub: otp-email, welcome-email]  | [Pub: train, route, schedule]    |
            |                                  |                                  |
            +----------------+  +--------------+                                  |
                             |  |                                                 |
                             v  v                                                 |
                   +-------------------------------------------------------+      |
                   |                  APACHE KAFKA BROKER                  |      |
                   |                      (Port 9093)                      |------+
                   |-------------------------------------------------------|
                   | Topics:                                               |
                   |  - otp-email-topic                                    |
                   |  - welcome-email-topic                                |
                   |  - train-created-topic                                |
                   |  - route-created-topic                                |
                   |  - schedule-created-topic                             |
                   +---------------------------+---------------------------+
                                               |
                                               | [Sub: otp-email, welcome-email]
                                               v
                                  +-----------------------+
                                  |  NOTIFICATION SERVICE |
                                  |      (Port 4004)      |
                                  |-----------------------|
                                  | - Kafka Consumer      |
                                  | - SendGrid Mailer     |
                                  | - HTML Email Templates|
                                  | - Dead-Letter / Retry |
                                  +-----------------------+
```

---

## 🧩 Microservices Breakdown

### 1. 🛡️ API Gateway (`api-gateway` — Port 4000)
The single entry point for all incoming client traffic. It manages traffic shaping, security, and resiliency before routing requests to downstream microservices.
* **Circuit Breaker Pattern (`proxy.js`):** Implements state-machine circuit breakers (`CLOSED` $\rightarrow$ `OPEN` $\rightarrow$ `HALF_OPEN`) per downstream service to prevent cascading failures.
* **Sliding-Window Rate Limiting (`rateLimiting.middleware.js`):** Redis `INCR` + `PEXPIRE` rate limiters across 3 levels:
  * Global IP limiter (coarse protection)
  * Sensitive endpoint limiter (e.g., max 5 OTP requests / 15m)
  * Combined user-aware limiter (`x-user-id` based)
* **Auth Context Forwarding:** Validates Bearer access tokens at the perimeter and forwards authenticated claims via `x-user-id` downstream.
* **Header Sanitization:** Strips hop-by-hop headers (`host`, `content-length`, `connection`) to prevent proxy injection.

### 2. 👤 User Service (`user-service` — Port 4001)
Responsible for identity lifecycle, authentication protocols, and user profiles.
* **Dual Authentication Flow:**
  * **Email + OTP:** Redis-backed OTP storage with TTL (5m), rate limiting, and HMAC digest verification.
  * **Google OAuth 2.0:** Secure verification of Google ID tokens with automated **Account Linking** (linking Google identities to existing email accounts).
* **Token Rotation with Device Fingerprinting:** Generates short-lived Access Tokens (15m) and long-lived Refresh Tokens (7d). Secure refresh token rotation tied to SHA-256 device fingerprints to neutralize token theft.
* **Cache-Aside Pattern:** High-speed Redis caching for user profiles (`redis: user:{id}`) backed by PostgreSQL fallback.
* **Kafka Event Dispatching:** Dispatches `otp-email-topic` and `welcome-email-topic` asynchronously using an idempotent KafkaJS producer.

### 3. 🚆 Admin Service (`admin-service` — Port 4002)
Manages the railway physical and operational hierarchy.
* **Stations:** CRUD operations with duplicate detection, case-insensitive multi-field search (`code`, `name`, `city`), and paginated responses via `Promise.all` optimization.
* **Trains & Seats:** Atomic creation of trains and individual coaches/seats (`LOWER`, `MIDDLE`, `UPPER`, `SIDE_LOWER`, `SIDE_UPPER`) in a single Prisma transaction.
* **Routes & Stoppages:** Multi-station route graphs with strict continuous sequence validation (`1..N`), distance tracking, and arrival/departure timings.
* **Train Schedules:** Daily operational scheduling linking trains to departure dates with duplicate schedule collision prevention.
* **Domain Events:** Emits `train-created`, `route-created`, and `schedule-created` events to Kafka.

### 4. 🔍 Search Service (`search-service` — Port 4003)
Optimized train discovery and route resolution engine.
* **Train Search:** Origin-to-destination query resolution between any two stations on an active schedule.
* **Station Autocomplete:** Prefix and substring station matching for instant type-ahead.
* **Event Synchronization:** Consumes admin events via Kafka consumer groups to keep search indices consistent in real time.

### 5. 📬 Notification Service (`notification-service` — Port 4004)
Worker microservice dedicated to asynchronous communication.
* **Kafka Consumers:** Listens to `otp-email-topic` and `welcome-email-topic`.
* **Templated Emails:** Branded SendGrid dynamic transactional emails with OTP badges and welcoming onboarding copy.
* **Fault Handling:** Consumer retry logic, dead-letter strategies, and graceful disconnect handlers.

---

## 🗄️ Storage & Infrastructure Architecture

| Component | Port | Technology | Purpose |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `5432` | PostgreSQL 15 | **Database-per-Service:** Isolated databases (`postgres`, `admin_db`, `search_db`) |
| **Redis** | `6379` | Redis Stack 6.2 | Session store, OTP verification, Sliding-Window rate limiting, User profile cache |
| **Redis Insight** | `8001` | Redis GUI | Live visualization of cache keys, TTLs, and data types |
| **Apache Kafka** | `9092` / `9093` | Confluent Kafka 7.5 | Distributed asynchronous event bus (Internal: 9092, Host: 9093) |
| **Zookeeper** | `2181` | Confluent ZK 7.5 | Cluster coordination and broker leader election |
| **Kafka UI** | `8080` | Provectus Kafka-UI | Live topic monitoring, consumer lag inspection, message payload inspection |
| **pgAdmin 4** | `8081` | dpage/pgadmin4 | PostgreSQL web administration client |

---

## 📡 Kafka Event Topics

```
+------------------------+-------------------+---------------------------------------------+
| Topic Name             | Producer          | Consumer / Purpose                          |
+------------------------+-------------------+---------------------------------------------+
| otp-email-topic        | user-service      | notification-service: Send verification OTP |
| welcome-email-topic    | user-service      | notification-service: Send welcome email     |
| train-created-topic    | admin-service     | search-service: Index new trains            |
| route-created-topic    | admin-service     | search-service: Build station-route paths   |
| schedule-created-topic | admin-service     | search-service, inventory-service           |
+------------------------+-------------------+---------------------------------------------+
```

---

## 🚀 API Endpoints Overview

### API Gateway (`http://localhost:4000/api`)

#### 🔐 Authentication & User (`/api/users/*`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/users/auth/register` | Public | Initiates registration & sends OTP via Kafka |
| `POST` | `/users/auth/verify-otp` | Public | Verifies OTP & creates user record |
| `POST` | `/users/auth/login` | Public | Authenticates credentials; returns Access + Refresh Token |
| `POST` | `/users/auth/refresh-token` | Public | Rotates Refresh Token & returns new Access Token |
| `POST` | `/users/auth/google` | Public | Google OAuth 2.0 login with automatic account linking |
| `POST` | `/users/auth/logout` | Protected | Revokes active refresh token from Redis |
| `GET` | `/users/user/profile` | Protected | Returns authenticated user profile (Cache-Aside) |

#### 🛠️ Admin Management (`http://localhost:4002`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/station` | Creates a new railway station (`code`, `name`, `city`, `state`) |
| `GET` | `/api/v1/station` | Paginated station list with multi-field search (`?page=1&limit=10&search=delhi`) |
| `GET` | `/api/v1/station/:id` | Returns station details by ID |
| `PUT` | `/api/v1/station/:id` | Updates station metadata |
| `DELETE` | `/api/v1/station/:id` | Deletes a station |
| `POST` | `/api/v1/train` | Creates train with full seat layout in a single atomic transaction |
| `GET` | `/api/v1/train` | Lists all trains with seats, route stops, and station details |
| `GET` | `/api/v1/train/:id` | Fetches single train with full relational tree |
| `POST` | `/api/v1/route` | Builds sequential route stops with continuous sequence validation |
| `POST` | `/api/v1/schedule` | Creates train operating schedule for a departure date |

#### 🔍 Search Service (`http://localhost:4003`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/search` | Search trains between stations (`?from=NDLS&to=CNB&date=2026-10-05`) |
| `GET` | `/api/v1/search/autocomplete` | Fast station autocomplete by prefix/substring (`?q=del`) |

---

## 🛠️ Getting Started (Local Development)

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/)
* [npm](https://www.npmjs.com/) (v9+ with workspace support)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/ARPITPRAJAPATI/railway.git
cd railway

# Install root & all microservice workspace dependencies
npm install
```

### 2. Start Infrastructure via Docker Compose
```bash
docker compose up -d
```
Verify all 6 containers are running:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 3. Environment Configuration
Each service contains a `.env.example`. Copy them to `.env`:
```bash
cp api-gateway/.env.example api-gateway/.env
cp user-service/.env.example user-service/.env
cp admin-service/.env.example admin-service/.env
cp search-service/.env.example search-service/.env
cp notification-service/.env.example notification-service/.env
```

### 4. Database Migrations (Prisma)
Run migrations for services with dedicated databases:
```bash
# User Service Database
cd user-service && npx prisma migrate dev --name init && cd ..

# Admin Service Database
cd admin-service && npx prisma migrate dev --name init && cd ..
```

### 5. Running the Microservices
Start services independently using npm workspaces from the root folder:

```bash
# Start API Gateway (Port 4000)
npm run dev:gateway

# Start User Service (Port 4001)
npm run dev:user

# Start Admin Service (Port 4002)
npm run dev:admin

# Start Search Service (Port 4003)
npm run dev:search

# Start Notification Service (Port 4004)
npm run dev:notification
```

---

## 📈 Roadmap & Next Milestones
- [x] Docker Infrastructure (Postgres, Redis, Kafka, Zookeeper, Kafka-UI, pgAdmin)
- [x] API Gateway with Circuit Breakers, Reverse Proxy & Redis Rate Limiting
- [x] User Service with OTP, Google OAuth, Token Rotation & Device Fingerprint
- [x] Notification Service with Kafka Consumer & SendGrid Email Templates
- [x] Admin Service with Station, Train, Route & Schedule management
- [x] Search Service with route discovery and autocomplete
- [ ] **Inventory Service:** Real-time seat layout tracking & seat holding engine
- [ ] **Booking Service:** High-concurrency Tatkal booking with Redis Distributed Locks
- [ ] **Distributed Saga Pattern:** Automated compensation transactions across Booking $\leftrightarrow$ Payment
- [ ] **Observability:** OpenTelemetry Distributed Tracing, Prometheus metrics & Grafana dashboards
- [ ] **Kubernetes (K8s):** Helm charts & KEDA auto-scaling based on Kafka consumer lag

---

## 📄 License
ISC © [ARPIT PRAJAPATI](https://github.com/ARPITPRAJAPATI)
