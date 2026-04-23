Project Goal: Build and implement the "Intelligence Layer" (Core Logic Engine) for Chaster, a secure, high-end AI B2B customer support platform.

Chaster's Core Identity: Chaster is an "Intelligence Layer" that acts as a secure, reactive "Air Traffic Controller" for customer service messages.

The Chaster Stack (Immutable constraints):

Frontend: Public Preact/TypeScript chat widget. Isolated using a Shadow DOM.

Backend & Orchestration (Middleware): LangGraph (Stateful workflow management).

Database & RAG Indexing: Existing Supabase Instance. Focus is on adding new necessary elements and security layers that integrate with this structure. Add new tables for:

Widget security configuration (public.app_configurations, with unique app_id and secret HMAC keys for verification).

Knowledge base vector storage (public.knowledge_chunks, utilizing pgvector with an HNSW index, partitioned by tenant_id).

Integration: Model Context Protocol (MCP) as the definitive standard for all external live data fetches (Shopify, Stripe, custom client APIs).

Multitenancy: Strict isolation must be maintained via the existing Row Level Security (RLS) model on tenant_id across all tables.ccc