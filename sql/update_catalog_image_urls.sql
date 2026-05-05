UPDATE catalog SET image_url = CASE
  WHEN category = 'Electronics' THEN
    CASE
      WHEN subcategory = 'Headphones' THEN 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400'
      WHEN subcategory = 'Wearables' THEN 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'
      WHEN subcategory = 'Speakers' THEN 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400'
      WHEN subcategory = 'Cameras' THEN 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400'
      ELSE 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400'
    END
  WHEN category = 'Beauty & Wellness' THEN
    CASE
      WHEN subcategory = 'Skincare' THEN 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400'
      WHEN subcategory = 'Fragrance' THEN 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400'
      WHEN subcategory = 'Haircare' THEN 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400'
      ELSE 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400'
    END
  WHEN category = 'Home & Living' THEN
    CASE
      WHEN subcategory = 'Plants' THEN 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400'
      WHEN subcategory = 'Candles' THEN 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400'
      WHEN subcategory = 'Kitchen' THEN 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400'
      ELSE 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=400'
    END
  WHEN category = 'Fashion & Accessories' THEN
    CASE
      WHEN subcategory = 'Jewellery' THEN 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400'
      WHEN subcategory = 'Watches' THEN 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'
      WHEN subcategory = 'Bags' THEN 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400'
      ELSE 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400'
    END
  WHEN category = 'Gaming' THEN
    'https://images.unsplash.com/photo-1592840062661-a5a7f78e2056?w=400'
  WHEN category = 'Experience & Learning' THEN
    CASE
      WHEN subcategory = 'Books' THEN 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400'
      WHEN subcategory = 'Music' THEN 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400'
      ELSE 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400'
    END
  ELSE 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400'
END;
