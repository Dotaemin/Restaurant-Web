require('dotenv').config();
const prisma = require('../lib/prisma');

// 35 New Ingredients with valid check constraint units ('kg', 'g', 'ml', 'l', 'tbsp', 'pcs', 'bunches')
const NEW_INGREDIENTS = [
  { name: 'Hành tím', unit: 'g' },
  { name: 'Nước mắm', unit: 'ml' },
  { name: 'Tỏi', unit: 'g' },
  { name: 'Gừng', unit: 'g' },
  { name: 'Ớt hiểm', unit: 'pcs' },
  { name: 'Sả', unit: 'bunches' },
  { name: 'Rau mùi', unit: 'bunches' },
  { name: 'Giá đỗ', unit: 'g' },
  { name: 'Nấm hương', unit: 'g' },
  { name: 'Tôm sú', unit: 'kg' },
  { name: 'Thịt gà', unit: 'kg' },
  { name: 'Thịt ba chỉ', unit: 'kg' },
  { name: 'Đậu phụ', unit: 'pcs' },
  { name: 'Dầu mè', unit: 'ml' },
  { name: 'Nước tương', unit: 'ml' },
  { name: 'Bún tươi', unit: 'kg' },
  { name: 'Cà chua', unit: 'kg' },
  { name: 'Dưa leo', unit: 'kg' },
  { name: 'Mắm tôm', unit: 'tbsp' },
  { name: 'Lá chanh', unit: 'bunches' },
  { name: 'Cốt dừa', unit: 'ml' },
  { name: 'Hạt sen', unit: 'g' },
  { name: 'Khoai môn', unit: 'kg' },
  { name: 'Cà rốt', unit: 'kg' },
  { name: 'Bắp cải', unit: 'kg' },
  { name: 'Hoa hồi', unit: 'pcs' },
  { name: 'Quế thanh', unit: 'pcs' },
  { name: 'Đậu xanh', unit: 'g' },
  { name: 'Mè rang', unit: 'g' },
  { name: 'Rau răm', unit: 'bunches' },
  { name: 'Cần tây', unit: 'bunches' },
  { name: 'Măng tươi', unit: 'kg' },
  { name: 'Tiêu đen', unit: 'g' },
  { name: 'Đường phèn', unit: 'g' },
  { name: 'Hành lá', unit: 'bunches' }
];

// 47 New Chefs with Vietnamese names and specialties
const NEW_CHEFS = [
  { name: 'Chef Nguyễn Văn An', specialty: 'Ẩm thực Bắc Bộ' },
  { name: 'Chef Trần Bảo Long', specialty: 'Món nướng than hoa' },
  { name: 'Chef Lê Hoàng Yến', specialty: 'Bánh truyền thống & Tráng miệng' },
  { name: 'Chef Phạm Gia Huy', specialty: 'Hải sản miền Trung' },
  { name: 'Chef Đặng Quốc Việt', specialty: 'Ẩm thực cung đình Huế' },
  { name: 'Chef Bùi Hữu Nghĩa', specialty: 'Món ăn Nam Bộ' },
  { name: 'Chef Vũ Đình Trọng', specialty: 'Món xào & Wok Master' },
  { name: 'Chef Hồ Cẩm Nhung', specialty: 'Dimsum & Ẩm thực Quảng Đông' },
  { name: 'Chef Đỗ Minh Quân', specialty: 'Lẩu & Món hầm thảo mộc' },
  { name: 'Chef Ngô Thanh Tùng', specialty: 'Ẩm thực đường phố Sài Gòn' },
  { name: 'Chef Dương Hải Đăng', specialty: 'Đặc sản Tây Bắc' },
  { name: 'Chef Lý Gia Thành', specialty: 'Mì & Bún truyền thống' },
  { name: 'Chef Mai Văn Cường', specialty: 'Món chay & Thực dưỡng' },
  { name: 'Chef Đoàn Nhật Minh', specialty: 'Nướng Teppanyaki & Robata' },
  { name: 'Chef Phan Khắc Tiệp', specialty: 'Món cuốn & Gỏi Á Đông' },
  { name: 'Chef Lương Vĩnh Phúc', specialty: 'Ẩm thực Nhật Bản truyền thống' },
  { name: 'Chef Tạ Quang Bửu', specialty: 'Súp & Nước dùng thượng hạng' },
  { name: 'Chef Chu Tuấn Kiệt', specialty: 'Ẩm thực Hàn Quốc hiện đại' },
  { name: 'Chef Trịnh Công Sơn', specialty: 'Gia vị & Nước sốt cung đình' },
  { name: 'Chef Lâm Chí Dĩnh', specialty: 'Món quay & Nướng mật ong' },
  { name: 'Chef Hà Trọng Khang', specialty: 'Ẩm thực Tứ Xuyên cay nồng' },
  { name: 'Chef Thạch Bảo Khánh', specialty: 'Đặc sản miền Tây sông nước' },
  { name: 'Chef Quách Vĩnh Sanh', specialty: 'Ẩm thực Triều Châu' },
  { name: 'Chef Đào Duy Từ', specialty: 'Trà đạo & Đồ uống thảo mộc' },
  { name: 'Chef Tăng Thanh Hà', specialty: 'Salad & Ẩm thực hữu cơ' },
  { name: 'Chef Nghiêm Xuân Tú', specialty: 'Món om & Kho tộ đất nung' },
  { name: 'Chef Bạch Thái Bưởi', specialty: 'Đặc sản hải sản Vân Đồn' },
  { name: 'Chef Tiêu Phong', specialty: 'Ẩm thực Tây Tạng & Mông Cổ' },
  { name: 'Chef La Thành', specialty: 'Món tiềm thuốc bắc dưỡng sinh' },
  { name: 'Chef Thái Bá Nam', specialty: 'Thịt bò ủ tuyết & Bít tết Á' },
  { name: 'Chef Doãn Quốc Đam', specialty: 'Món khai vị & Finger food Á' },
  { name: 'Chef Khổng Tử Minh', specialty: 'Ẩm thực Sơn Đông' },
  { name: 'Chef Trương Định', specialty: 'Món nướng lá chuối & Ống tre' },
  { name: 'Chef Nhâm Hoàng Khang', specialty: 'Món chiên giòn & Tempura' },
  { name: 'Chef Cổ Thiên Lạc', specialty: 'Cơm thố & Cơm niêu đất' },
  { name: 'Chef Dư Văn Lạc', specialty: 'Ẩm thực Thái Lan chua cay' },
  { name: 'Chef Kiều Minh Tuấn', specialty: 'Món ăn gia đình ba miền' },
  { name: 'Chef Thiều Bảo Trâm', specialty: 'Chè & Thức uống giải nhiệt' },
  { name: 'Chef Tô Hiến Thành', specialty: 'Hải sản Côn Đảo tươi sống' },
  { name: 'Chef Văn Cao', specialty: 'Ẩm thực Hà Thành xưa' },
  { name: 'Chef Trương Vô Kỵ', specialty: 'Ẩm thực Tân Cương & Trung Á' },
  { name: 'Chef Lục Tiểu Linh', specialty: 'Món hấp giữ trọn dinh dưỡng' },
  { name: 'Chef Diệp Vấn', specialty: 'Ẩm thực Phật Sơn & Hồng Kông' },
  { name: 'Chef Bành Vu Yến', specialty: 'Món điểm tâm sáng hoàng gia' },
  { name: 'Chef Kim Trọng', specialty: 'Ẩm thực thiền định & Chay tịnh' },
  { name: 'Chef Hải Triều', specialty: 'Món nhắm bia thủ công' },
  { name: 'Chef Lưu Bị', specialty: 'Ẩm thực Thục Xuyên & Lẩu cay' }
];

const FOOD_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555126634-323283e090fa?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1559847844-5315695dadae?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=800&auto=format&fit=crop&q=80'
];

async function seedExtended() {
  console.log('=== Starting Extended Database Seeding for B.H.T Diner ===');

  // 1. Seed 35 Ingredients
  console.log('1. Checking and seeding 35 ingredients...');
  for (const ing of NEW_INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { name: ing.name },
      update: { unit: ing.unit },
      create: ing
    });
  }
  const allIngredients = await prisma.ingredient.findMany();
  console.log(`   ✓ Total ingredients in DB now: ${allIngredients.length}`);

  // 2. Seed 47 Chefs
  console.log('2. Checking and seeding 47 chefs...');
  for (const chef of NEW_CHEFS) {
    await prisma.chef.upsert({
      where: { name: chef.name },
      update: { specialty: chef.specialty },
      create: chef
    });
  }
  const allChefs = await prisma.chef.findMany();
  console.log(`   ✓ Total chefs in DB now: ${allChefs.length}`);

  // 3. Check current dish count
  const existingDishes = await prisma.dish.findMany({ select: { name: true } });
  const existingDishNames = new Set(existingDishes.map(d => d.name));
  const dishesNeeded = 1000 - existingDishes.length;
  console.log(`3. Currently ${existingDishes.length} dishes in DB. Target: 1000. Dishes to add: ${dishesNeeded}`);

  if (dishesNeeded <= 0) {
    console.log('Target of 1000 dishes already met!');
    return;
  }

  // 4. Generate Vietnamese & Asian dishes
  const bases = [
    { name: 'Phở', cat: 'Main Course' },
    { name: 'Bún', cat: 'Main Course' },
    { name: 'Mì', cat: 'Main Course' },
    { name: 'Miến', cat: 'Main Course' },
    { name: 'Cơm', cat: 'Main Course' },
    { name: 'Bò', cat: 'Main Course' },
    { name: 'Gà', cat: 'Main Course' },
    { name: 'Heo', cat: 'Main Course' },
    { name: 'Tôm', cat: 'Main Course' },
    { name: 'Cá', cat: 'Main Course' },
    { name: 'Mực', cat: 'Main Course' },
    { name: 'Vịt', cat: 'Main Course' },
    { name: 'Lẩu', cat: 'Main Course' },
    { name: 'Canh', cat: 'Main Course' },
    { name: 'Nem', cat: 'Appetizer' },
    { name: 'Chả', cat: 'Appetizer' },
    { name: 'Bánh', cat: 'Appetizer' },
    { name: 'Gỏi', cat: 'Appetizer' },
    { name: 'Nộm', cat: 'Appetizer' },
    { name: 'Súp', cat: 'Appetizer' },
    { name: 'Chè', cat: 'Dessert' },
    { name: 'Bánh ngọt', cat: 'Dessert' },
    { name: 'Kem', cat: 'Dessert' },
    { name: 'Thạch', cat: 'Dessert' },
    { name: 'Trà', cat: 'Beverage' },
    { name: 'Cà phê', cat: 'Beverage' },
    { name: 'Nước ép', cat: 'Beverage' },
    { name: 'Sinh tố', cat: 'Beverage' }
  ];

  const preparations = [
    'nướng than hoa', 'kho tộ đất nung', 'xào lăn sả ớt', 'hấp gừng hành', 'chiên giòn sốt me',
    'hầm hạt sen thảo mộc', 'nấu măng chua', 'quay mật ong giòn bì', 'rang muối ớt', 'om dưa chua',
    'xào dưa bò', 'nấu cà ri cốt dừa', 'nướng muối ớt xanh', 'kho tiêu cay nồng', 'hấp lá chanh',
    'lắc tỏi ớt', 'nấu lẩu chua cay', 'sốt chua ngọt', 'xào nấm đông cô', 'áp chảo bơ tỏi',
    'tiềm thuốc bắc dưỡng sinh', 'chưng mắm tôm', 'nướng ống tre', 'cuộn thịt nướng', 'nấu tiêu xanh'
  ];

  const regionsAndQualities = [
    'Hà Thành', 'cung đình Huế', 'Sài Gòn xưa', 'Nam Bộ', 'miền Tây sông nước',
    'Tây Bắc', 'Hội An', 'Đà Nẵng', 'Hạ Long', 'Nha Trang',
    'Bình Định', 'Phú Quốc', 'thượng hạng', 'đặc biệt', 'hoàng gia',
    'truyền thống', 'gia truyền B.H.T', 'ngũ vị', 'bát bửu', 'đậm đà'
  ];

  const drinkDessertTypes = [
    { name: 'Trà sen Tây Hồ ướp sớm', cat: 'Beverage' },
    { name: 'Trà đào cam sả thanh mát', cat: 'Beverage' },
    { name: 'Cà phê trứng Hà Nội béo ngậy', cat: 'Beverage' },
    { name: 'Cà phê sữa đá Sài Gòn đậm đà', cat: 'Beverage' },
    { name: 'Nước sâm mía lau hạt chia', cat: 'Beverage' },
    { name: 'Nước ép cóc ổi sơ ri chua ngọt', cat: 'Beverage' },
    { name: 'Sinh tố bơ sáp sầu riêng', cat: 'Beverage' },
    { name: 'Trà hoa cúc mật ong rừng', cat: 'Beverage' },
    { name: 'Trà quất mật ong giải nhiệt', cat: 'Beverage' },
    { name: 'Nước mía sầu riêng thơm lừng', cat: 'Beverage' },
    { name: 'Chè hạt sen long nhãn Phố Hiến', cat: 'Dessert' },
    { name: 'Chè bưởi An Giang giòn sần sật', cat: 'Dessert' },
    { name: 'Chè đậu đỏ bánh lọt cốt dừa', cat: 'Dessert' },
    { name: 'Chè thạch khúc bạch hạnh nhân', cat: 'Dessert' },
    { name: 'Chè bà ba Nam Bộ dẻo bùi', cat: 'Dessert' },
    { name: 'Sương sáo sữa dừa đường thốt nốt', cat: 'Dessert' },
    { name: 'Rau câu sơn thủy ngũ vị', cat: 'Dessert' },
    { name: 'Bánh flan caramel cốt dừa nướng', cat: 'Dessert' },
    { name: 'Xôi xoài dẻo béo nước cốt dừa', cat: 'Dessert' },
    { name: 'Chè trôi nước gừng ấm nồng', cat: 'Dessert' }
  ];

  const generatedDishes = [];
  let nameIndex = 1;

  // Add signature drinks and desserts first
  for (const item of drinkDessertTypes) {
    if (!existingDishNames.has(item.name) && generatedDishes.length < dishesNeeded) {
      existingDishNames.add(item.name);
      generatedDishes.push({
        name: item.name,
        category: item.cat,
        description: `Món ${item.name.toLowerCase()} đặc sắc mang đậm phong vị ẩm thực Á Đông truyền thống, thanh nhiệt và bổ dưỡng.`,
        price: parseFloat((item.cat === 'Beverage' ? 3.5 + Math.random() * 4 : 4.0 + Math.random() * 5).toFixed(2))
      });
    }
  }

  // Generate main courses and appetizers systematically
  outerLoop:
  for (const base of bases) {
    for (const prep of preparations) {
      for (const reg of regionsAndQualities) {
        if (generatedDishes.length >= dishesNeeded) break outerLoop;

        const candidateName = `${base.name} ${prep} ${reg}`;
        if (!existingDishNames.has(candidateName)) {
          existingDishNames.add(candidateName);

          let priceRange = [12.0, 38.0];
          if (base.cat === 'Appetizer') priceRange = [6.0, 18.0];
          else if (base.cat === 'Dessert') priceRange = [4.5, 12.0];
          else if (base.cat === 'Beverage') priceRange = [3.5, 8.5];

          const price = parseFloat((priceRange[0] + Math.random() * (priceRange[1] - priceRange[0])).toFixed(2));
          const desc = `Món ${candidateName} được chế biến tỉ mỉ từ nguyên liệu tươi ngon chọn lọc theo công thức độc quyền của B.H.T Diner, mang đến hương vị tròn đầy khó quên.`;

          generatedDishes.push({
            name: candidateName,
            category: base.cat,
            description: desc,
            price
          });
        }
      }
    }
  }

  // If still need more to hit exact number, generate numbered variants
  while (generatedDishes.length < dishesNeeded) {
    const base = bases[generatedDishes.length % bases.length];
    const candidateName = `${base.name} đặc sản B.H.T số ${nameIndex++}`;
    if (!existingDishNames.has(candidateName)) {
      existingDishNames.add(candidateName);
      generatedDishes.push({
        name: candidateName,
        category: base.cat,
        description: `Món ${candidateName} chế biến theo phong cách ẩm thực Á Đông đương đại, tinh tế và hấp dẫn.`,
        price: parseFloat((8.0 + Math.random() * 25).toFixed(2))
      });
    }
  }

  console.log(`Generated ${generatedDishes.length} unique dishes.`);

  // Prepare dish payload with chefs and images
  const chefIds = allChefs.map(c => c.id);
  const ingredientIds = allIngredients.map(i => i.id);

  console.log(`5. Inserting dishes in batches of 100...`);
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  for (let i = 0; i < generatedDishes.length; i += BATCH_SIZE) {
    const chunk = generatedDishes.slice(i, i + BATCH_SIZE);
    
    // Batch create dishes
    const createdChunk = await prisma.$transaction(
      chunk.map((dish, idx) => {
        const assignedChefId = chefIds[(i + idx) % chefIds.length];
        const assignedImg = FOOD_IMAGES[(i + idx) % FOOD_IMAGES.length];
        const isAvailable = (i + idx) % 15 !== 0; // ~93% available

        // Pick 2-4 existing ingredients
        const numIngs = 2 + ((i + idx) % 3);
        const selectedIngIds = [];
        for (let j = 0; j < numIngs; j++) {
          const ingId = ingredientIds[(i + idx + j * 7) % ingredientIds.length];
          if (!selectedIngIds.includes(ingId)) selectedIngIds.push(ingId);
        }

        return prisma.dish.create({
          data: {
            name: dish.name,
            description: dish.description,
            price: dish.price,
            category: dish.category,
            available: isAvailable,
            imageUrl: assignedImg,
            chefId: assignedChefId,
            ingredients: {
              connect: selectedIngIds.map(id => ({ id }))
            }
          }
        });
      })
    );

    insertedCount += createdChunk.length;
    console.log(`   ✓ Inserted ${insertedCount} / ${generatedDishes.length} dishes...`);
  }

  // Final verification
  const finalDishCount = await prisma.dish.count();
  const finalChefCount = await prisma.chef.count();
  const finalIngCount = await prisma.ingredient.count();

  console.log('\n======================================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY 🎉');
  console.log(`Dishes:      ${finalDishCount} (Target: 1000)`);
  console.log(`Chefs:       ${finalChefCount} (Target: >= 50)`);
  console.log(`Ingredients: ${finalIngCount} (Target: >= 50)`);
  console.log('======================================================');
}

seedExtended()
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
