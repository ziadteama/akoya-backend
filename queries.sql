-- Table: public.users

-- DROP TABLE IF EXISTS public.users;

CREATE TABLE IF NOT EXISTS public.users
(
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    username character varying(50) COLLATE pg_catalog."default" NOT NULL,
    password_hash text COLLATE pg_catalog."default" NOT NULL,
    role character varying(20) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT users_role_check CHECK (role::text = ANY (ARRAY['admin'::character varying::text, 'accountant'::character varying::text, 'cashier'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.users
    OWNER to postgres;      

    -- Table: public.tickets

-- DROP TABLE IF EXISTS public.tickets;

CREATE TABLE IF NOT EXISTS public.tickets
(
    id integer NOT NULL DEFAULT nextval('tickets_id_seq'::regclass),
    ticket_type_id integer,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'available'::character varying,
    valid boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sold_at timestamp without time zone,
    sold_price numeric(10,2),
    order_id integer,
    CONSTRAINT tickets_pkey PRIMARY KEY (id),
    CONSTRAINT fk_order FOREIGN KEY (order_id)
        REFERENCES public.orders (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id)
        REFERENCES public.ticket_types (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT tickets_status_check CHECK (status::text = ANY (ARRAY['available'::character varying::text, 'sold'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.tickets
    OWNER to postgres;

-- Trigger: gross_total_ticket_trigger

-- DROP TRIGGER IF EXISTS gross_total_ticket_trigger ON public.tickets;

CREATE OR REPLACE TRIGGER gross_total_ticket_trigger
    AFTER INSERT OR DELETE OR UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_order_gross_total();

-- Trigger: ticket_status_update

-- DROP TRIGGER IF EXISTS ticket_status_update ON public.tickets;

CREATE OR REPLACE TRIGGER ticket_status_update
    BEFORE UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_sold_ticket();

-- Trigger: ticket_total_trigger

-- DROP TRIGGER IF EXISTS ticket_total_trigger ON public.tickets;

CREATE OR REPLACE TRIGGER ticket_total_trigger
    AFTER INSERT OR DELETE OR UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_order_total();

-- Trigger: trg_update_order_total_delete

-- DROP TRIGGER IF EXISTS trg_update_order_total_delete ON public.tickets;

CREATE OR REPLACE TRIGGER trg_update_order_total_delete
    AFTER DELETE
    ON public.tickets
    FOR EACH ROW
    WHEN (old.order_id IS NOT NULL)
    EXECUTE FUNCTION public.update_order_total();

-- Trigger: trigger_reset_sold_details

-- DROP TRIGGER IF EXISTS trigger_reset_sold_details ON public.tickets;

CREATE OR REPLACE TRIGGER trigger_reset_sold_details
    BEFORE UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.reset_sold_details();

-- Trigger: trigger_set_created_at

-- DROP TRIGGER IF EXISTS trigger_set_created_at ON public.tickets;

CREATE OR REPLACE TRIGGER trigger_set_created_at
    BEFORE INSERT
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();

-- Trigger: trigger_update_sold_at

-- DROP TRIGGER IF EXISTS trigger_update_sold_at ON public.tickets;

CREATE OR REPLACE TRIGGER trigger_update_sold_at
    BEFORE UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_sold_at();

    -- Table: public.ticket_types

-- DROP TABLE IF EXISTS public.ticket_types;

CREATE TABLE IF NOT EXISTS public.ticket_types
(
    id integer NOT NULL DEFAULT nextval('ticket_types_id_seq'::regclass),
    category character varying(50) COLLATE pg_catalog."default" NOT NULL,
    subcategory character varying(50) COLLATE pg_catalog."default" NOT NULL,
    price numeric(10,2) NOT NULL,
    description text COLLATE pg_catalog."default",
    archived boolean NOT NULL DEFAULT false,
    CONSTRAINT ticket_types_pkey PRIMARY KEY (id),
    CONSTRAINT unique_category_subcategory UNIQUE (category, subcategory),
    CONSTRAINT ticket_types_subcategory_check CHECK (subcategory::text = ANY (ARRAY['child'::character varying::text, 'grand'::character varying::text, 'adult'::character varying::text]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ticket_types
    OWNER to postgres;

    -- Table: public.payments

-- DROP TABLE IF EXISTS public.payments;

CREATE TABLE IF NOT EXISTS public.payments
(
    id integer NOT NULL DEFAULT nextval('payments_id_seq'::regclass),
    order_id integer NOT NULL,
    method payment_method NOT NULL,
    amount numeric(10,2) NOT NULL,
    CONSTRAINT payments_pkey PRIMARY KEY (id),
    CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id)
        REFERENCES public.orders (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT payments_amount_check CHECK (amount > 0::numeric)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.payments
    OWNER to postgres;

-- Trigger: payment_total_trigger

-- DROP TRIGGER IF EXISTS payment_total_trigger ON public.payments;

CREATE OR REPLACE TRIGGER payment_total_trigger
    AFTER INSERT OR DELETE OR UPDATE 
    ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_order_total();

    -- Table: public.orders

-- DROP TABLE IF EXISTS public.orders;

CREATE TABLE IF NOT EXISTS public.orders
(
    id integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
    user_id integer,
    description text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total_amount numeric(10,2) NOT NULL DEFAULT 0,
    gross_total numeric(10,2) DEFAULT 0,
    CONSTRAINT orders_pkey PRIMARY KEY (id),
    CONSTRAINT fk_user FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.orders
    OWNER to postgres;

    -- Table: public.orders

-- DROP TABLE IF EXISTS public.orders;

CREATE TABLE IF NOT EXISTS public.orders
(
    id integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
    user_id integer,
    description text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total_amount numeric(10,2) NOT NULL DEFAULT 0,
    gross_total numeric(10,2) DEFAULT 0,
    CONSTRAINT orders_pkey PRIMARY KEY (id),
    CONSTRAINT fk_user FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.orders
    OWNER to postgres;

    -- Table: public.meals

-- DROP TABLE IF EXISTS public.meals;

CREATE TABLE IF NOT EXISTS public.meals
(
    id integer NOT NULL DEFAULT nextval('meals_id_seq'::regclass),
    name text COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    price numeric(10,2) NOT NULL,
    age_group age_group NOT NULL,
    archived boolean DEFAULT false,
    CONSTRAINT meals_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.meals
    OWNER to postgres;


    ALTER TABLE tickets DISABLE TRIGGER ALL;


INSERT INTO tickets (id)
SELECT generate_series(1, 50000);


ALTER TABLE tickets ENABLE TRIGGER ALL;


SELECT setval('tickets_id_seq', 50000, true);



-- Pre-hashed version (if you're hashing from backend)
INSERT INTO public.users (name, username, password_hash, role)
VALUES 
  ('Teama', 'heshamteama', '$2a$10$l1Ju15HA/e0giro2KalGie./7rpRChi0eqvqiB1HYwRD8gXV3W.Cm', 'admin'),
  ('Mohamed Abdelgawad', 'moabdelgawad', '$2a$10$oxMcj3oeItXhh/LhAJzjZeOSZRBzKgOewwOhni0tngb83BLmLVR6y', 'accountant');
