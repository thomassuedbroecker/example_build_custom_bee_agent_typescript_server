# Example building a custom Bee Agent and use it in a TypeScript server

Related blog post for the documentation [Building a Custom Bee Agent in TypeScript](https://suedbroecker.net/2025/01/14/building-a-custom-bee-agent-in-typescript/).

## Setup

### 1. Install the needed package

```sh
npm install 
```

### 2. Create .env file with variables

```sh
cat .env_template > .env
```

Content of the `.env` file.

```sh
## WatsonX
export WATSONX_API_KEY=
export WATSONX_PROJECT_ID=
export WATSONX_MODEL=""
export WATSONX_REGION=""
```

### 4. Run the server

```sh
source .env
npm start src/index.ts
```

### 6. Open Swagger-UI in browser

```sh
http://localhost:3000/docs
```

### 7. Invoke endpoint

```sh
curl -X 'POST' \
  'http://localhost:3000/agentcustomgerman' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "question": "What is the best city in Europe for a vacation?"
}'
```