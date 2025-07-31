-- Test schema creation script
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some test data
INSERT INTO products (name, price, category) VALUES 
    ('Laptop', 999.99, 'Electronics'),
    ('Book', 19.99, 'Education'),
    ('Coffee Mug', 12.50, 'Kitchen');

-- Create an index
CREATE INDEX idx_products_category ON products(category);