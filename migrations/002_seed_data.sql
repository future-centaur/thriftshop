-- Migration 002: Seed Data
-- Initial categories, qualities, and price rules for AliBeka

BEGIN;

-- Insert seed marker
INSERT INTO meta (key, value) VALUES ('seeded', 'true')
ON CONFLICT (key) DO NOTHING;

-- Seed categories
INSERT INTO categories (name) VALUES
    ('Dresses'),
    ('Pallazos'),
    ('Sweatpants'),
    ('Tops'),
    ('Shirts'),
    ('Trousers'),
    ('Skirts')
ON CONFLICT (name) DO NOTHING;

-- Seed qualities
INSERT INTO qualities (name) VALUES
    ('1st'),
    ('2nd'),
    ('3rd')
ON CONFLICT (name) DO NOTHING;

-- Seed price rules
INSERT INTO price_rules (category, quality, base_price) VALUES
    ('Dresses', '1st', 1000),
    ('Dresses', '2nd', 700),
    ('Dresses', '3rd', 450),
    ('Pallazos', '1st', 900),
    ('Pallazos', '2nd', 650),
    ('Pallazos', '3rd', 400),
    ('Sweatpants', '1st', 1000),
    ('Sweatpants', '2nd', 700),
    ('Sweatpants', '3rd', 450)
ON CONFLICT (category, quality) DO NOTHING;

COMMIT;
