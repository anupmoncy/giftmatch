const fs = require('node:fs');

const seedPath = process.argv[2] ?? '/Users/anup-admin/Desktop/catalog_seed_full.sql';

const imageUrls = {
  headphones: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
  watch: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
  candle: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400',
  plant: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
  book: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400',
  perfume: 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400',
  skincare: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400',
  gaming: 'https://images.unsplash.com/photo-1592840062661-a5a7f78e2056?w=400',
  jewellery: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400',
  speakers: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400',
  cameras: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400',
  electronics: 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400',
  haircare: 'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400',
  beauty: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400',
  kitchen: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400',
  home: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=400',
  bags: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400',
  fashion: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400',
  music: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
  experience: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
  default: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400',
};

function splitSqlValues(valueList) {
  const values = [];
  let current = '';
  let inQuote = false;

  for (let index = 0; index < valueList.length; index += 1) {
    const character = valueList[index];

    if (character === "'" && inQuote && valueList[index + 1] === "'") {
      current += "''";
      index += 1;
      continue;
    }

    if (character === "'") {
      inQuote = !inQuote;
      current += character;
      continue;
    }

    if (character === ',' && !inQuote) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function unquoteSql(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("'") && trimmed.endsWith("'")
    ? trimmed.slice(1, -1).replace(/''/g, "'")
    : trimmed;
}

function quoteSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pickImageUrl(fields) {
  const [, name, description, , , brand, category, subcategory] = fields;
  const haystack = [name, description, brand, category, subcategory].join(' ').toLowerCase();

  if (/headphone|earbud|wh-1000|airpods/.test(haystack) || subcategory === 'Headphones') {
    return imageUrls.headphones;
  }

  if (/apple watch|watch|wearable/.test(haystack) || ['Wearables', 'Watches'].includes(subcategory)) {
    return imageUrls.watch;
  }

  if (/candle|wax melt/.test(haystack) || subcategory === 'Candles') {
    return imageUrls.candle;
  }

  if (/plant|herb garden|terrarium/.test(haystack) || subcategory === 'Plants') {
    return imageUrls.plant;
  }

  if (/book|journal|reading/.test(haystack) || subcategory === 'Books') {
    return imageUrls.book;
  }

  if (/perfume|fragrance|cologne/.test(haystack) || subcategory === 'Fragrance') {
    return imageUrls.perfume;
  }

  if (/skincare|skin|cream|bha|serum|moisturizer/.test(haystack) || subcategory === 'Skincare') {
    return imageUrls.skincare;
  }

  if (/gaming|xbox|playstation|nintendo|arcade|pc gaming/.test(haystack) || category === 'Gaming') {
    return imageUrls.gaming;
  }

  if (/\b(jewellery|jewelry|bracelet|earring|necklace|ring)\b/.test(haystack) || subcategory === 'Jewellery') {
    return imageUrls.jewellery;
  }

  if (subcategory === 'Speakers') return imageUrls.speakers;
  if (subcategory === 'Cameras') return imageUrls.cameras;
  if (subcategory === 'Haircare') return imageUrls.haircare;
  if (subcategory === 'Kitchen') return imageUrls.kitchen;
  if (subcategory === 'Bags') return imageUrls.bags;
  if (subcategory === 'Music') return imageUrls.music;
  if (category === 'Electronics') return imageUrls.electronics;
  if (category === 'Beauty & Wellness') return imageUrls.beauty;
  if (category === 'Home & Living') return imageUrls.home;
  if (category === 'Fashion & Accessories') return imageUrls.fashion;
  if (category === 'Experience & Learning') return imageUrls.experience;

  return imageUrls.default;
}

const source = fs.readFileSync(seedPath, 'utf8');
let changedRows = 0;

const updated = source
  .split(/\n/)
  .map((line) => {
    const trimmed = line.trimStart();

    if (!trimmed.startsWith("('")) {
      return line;
    }

    const end = trimmed.endsWith(';') ? ';' : trimmed.endsWith(',') ? ',' : '';
    const body = trimmed.slice(1, trimmed.length - end.length - 1);
    const rawFields = splitSqlValues(body);

    if (rawFields.length !== 8) {
      return line;
    }

    const prefix = line.slice(0, line.length - trimmed.length);
    const fields = rawFields.map(unquoteSql);
    fields[4] = pickImageUrl(fields);
    changedRows += 1;

    return `${prefix}(${[
      quoteSql(fields[0]),
      quoteSql(fields[1]),
      quoteSql(fields[2]),
      fields[3],
      quoteSql(fields[4]),
      quoteSql(fields[5]),
      quoteSql(fields[6]),
      quoteSql(fields[7]),
    ].join(', ')})${end}`;
  })
  .join('\n');

fs.writeFileSync(seedPath, updated);

console.log(JSON.stringify({ seedPath, changedRows }, null, 2));
