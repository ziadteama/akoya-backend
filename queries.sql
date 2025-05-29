-- ENUMs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'age_group') THEN
        CREATE TYPE age_group AS ENUM ('child', 'adult', 'senior');
    END IF;
END$$;

-- TABLE: users
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'accountant', 'cashier'))
);

-- TABLE: orders
CREATE TABLE IF NOT EXISTS public.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    gross_total NUMERIC(10,2) DEFAULT 0
);

-- TABLE: meals
CREATE TABLE IF NOT EXISTS public.meals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    age_group age_group NOT NULL,
    archived BOOLEAN DEFAULT false
);

-- TABLE: order_meals
CREATE TABLE IF NOT EXISTS public.order_meals (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    meal_id INTEGER NOT NULL REFERENCES public.meals(id),
    quantity INTEGER DEFAULT 1 NOT NULL,
    price_at_order NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2)
);

-- TABLE: ticket_types
CREATE TABLE IF NOT EXISTS public.ticket_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL
);

-- TABLE: tickets
CREATE TABLE IF NOT EXISTS public.tickets (
    id SERIAL PRIMARY KEY,
    ticket_type_id INTEGER REFERENCES public.ticket_types(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'sold')),
    valid BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sold_at TIMESTAMP,
    sold_price NUMERIC(10,2),
    order_id INTEGER REFERENCES public.orders(id) ON DELETE CASCADE
);

-- FUNCTIONS
CREATE OR REPLACE FUNCTION public.calculate_order_meal_total()
RETURNS trigger AS $$
BEGIN
    NEW.total_price := NEW.price_at_order * NEW.quantity;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_order_total()
RETURNS trigger AS $$
BEGIN
    UPDATE public.orders
    SET total_amount = COALESCE((
        SELECT SUM(COALESCE(total_price, 0)) FROM public.order_meals WHERE order_id = NEW.order_id
    ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(sold_price, 0)) FROM public.tickets WHERE order_id = NEW.order_id
    ), 0)
    WHERE id = NEW.order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_order_gross_total()
RETURNS trigger AS $$
BEGIN
    UPDATE public.orders
    SET gross_total = COALESCE((
        SELECT COUNT(*) FROM public.tickets WHERE order_id = NEW.order_id
    ), 0) * 100  -- placeholder logic
    WHERE id = NEW.order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_sold_ticket()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'sold' AND OLD.status <> 'sold' THEN
        NEW.sold_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.reset_sold_details()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'available' THEN
        NEW.sold_at := NULL;
        NEW.sold_price := NULL;
        NEW.order_id := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_created_at()
RETURNS trigger AS $$
BEGIN
    IF NEW.created_at IS NULL THEN
        NEW.created_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_sold_at()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'sold' THEN
        NEW.sold_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS
CREATE TRIGGER set_total_price_on_insert
BEFORE INSERT OR UPDATE ON public.order_meals
FOR EACH ROW EXECUTE FUNCTION public.calculate_order_meal_total();

CREATE TRIGGER meal_total_trigger
AFTER INSERT OR DELETE OR UPDATE ON public.order_meals
FOR EACH ROW EXECUTE FUNCTION public.update_order_total();

CREATE TRIGGER trg_update_order_total_meals_delete
AFTER DELETE ON public.order_meals
FOR EACH ROW WHEN (OLD.order_id IS NOT NULL)
EXECUTE FUNCTION public.update_order_total();

CREATE TRIGGER gross_total_meal_trigger
AFTER INSERT OR DELETE OR UPDATE ON public.order_meals
FOR EACH ROW EXECUTE FUNCTION public.update_order_gross_total();

CREATE TRIGGER ticket_total_trigger
AFTER INSERT OR DELETE OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_order_total();

CREATE TRIGGER trg_update_order_total_delete
AFTER DELETE ON public.tickets
FOR EACH ROW WHEN (OLD.order_id IS NOT NULL)
EXECUTE FUNCTION public.update_order_total();

CREATE TRIGGER gross_total_ticket_trigger
AFTER INSERT OR DELETE OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_order_gross_total();

CREATE TRIGGER ticket_status_update
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_sold_ticket();

CREATE TRIGGER trigger_reset_sold_details
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.reset_sold_details();

CREATE TRIGGER trigger_set_created_at
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_created_at();

CREATE TRIGGER trigger_update_sold_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_sold_at();

-- USERS
INSERT INTO public.users (name, username, password_hash, role) VALUES
('Admin User', 'admin', 'hashed_password1', 'admin'),
('Accountant User', 'accountant', 'hashed_password2', 'accountant');

-- BULK TICKETS
DO $$
BEGIN
  FOR i IN 1..50000 LOOP
    INSERT INTO public.tickets (status, valid) VALUES ('available', true);
  END LOOP;
END$$;