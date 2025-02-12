-- Table: public.ticket_types

-- DROP TABLE IF EXISTS public.ticket_types;

CREATE TABLE IF NOT EXISTS public.ticket_types
(
    id integer NOT NULL DEFAULT nextval('ticket_types_id_seq'::regclass),
    category character varying(50) COLLATE pg_catalog."default" NOT NULL,
    subcategory character varying(50) COLLATE pg_catalog."default" NOT NULL,
    price numeric(10,2) NOT NULL,
    description text COLLATE pg_catalog."default",
    CONSTRAINT ticket_types_pkey PRIMARY KEY (id),
    CONSTRAINT ticket_types_subcategory_check CHECK (subcategory::text = ANY (ARRAY['child'::character varying, 'grand'::character varying, 'adult'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ticket_types
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
    CONSTRAINT tickets_pkey PRIMARY KEY (id),
    CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id)
        REFERENCES public.ticket_types (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT tickets_status_check CHECK (status::text = ANY (ARRAY['available'::character varying, 'sold'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.tickets
    OWNER to postgres;

-- Trigger: ticket_status_update

-- DROP TRIGGER IF EXISTS ticket_status_update ON public.tickets;

CREATE OR REPLACE TRIGGER ticket_status_update
    BEFORE UPDATE 
    ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_sold_ticket();

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
-- Table: public.users

-- DROP TABLE IF EXISTS public.users;

CREATE TABLE IF NOT EXISTS public.users
(
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    username character varying(50) COLLATE pg_catalog."default" NOT NULL,
    password_hash text COLLATE pg_catalog."default" NOT NULL,
    role character varying(20) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT users_role_check CHECK (role::text = ANY (ARRAY['admin'::character varying, 'accountant'::character varying, 'cashier'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.users
    OWNER to postgres;