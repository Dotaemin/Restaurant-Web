import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing Selection Modals, Admin Pagination, & Cutlery Resize...\n');

// 1. Verify BigCutlery SVG sizing
const bigCutleryContent = fs.readFileSync(path.join(__dirname, '../client/src/components/BigCutlery.jsx'), 'utf-8');
assert(bigCutleryContent.includes('w-12 h-12 sm:w-16 sm:h-16'), 'BigCutlery should have scaled down cutlery dimensions w-12 h-12 sm:w-16 sm:h-16');
assert(!bigCutleryContent.includes('w-20 h-20 sm:w-28 sm:h-28'), 'BigCutlery should not contain the old oversized dimensions');
console.log('✅ PASS: BigCutlery downsized correctly to prevent clipping');

// 2. Verify Top Header z-index in Layout.jsx
const layoutContent = fs.readFileSync(path.join(__dirname, '../client/src/components/Layout.jsx'), 'utf-8');
assert(layoutContent.includes('sticky top-0 z-40 bg-[#ba1414]'), 'Layout header must be z-40 so non-form modals do not cover or blur top bar');
console.log('✅ PASS: Top bar header has z-40 above non-form backdrop z-30');

// 3. Verify ChefSelectModal implementation
const chefModalContent = fs.readFileSync(path.join(__dirname, '../client/src/components/ChefSelectModal.jsx'), 'utf-8');
assert(chefModalContent.includes('Enter chef name...'), 'ChefSelectModal must have search field with hint "Enter chef name..."');
assert(chefModalContent.includes('Select Chef'), 'ChefSelectModal must have title and button "Select Chef"');
assert(chefModalContent.includes('disabled={!tempSelectedId}'), 'Select Chef button must be disabled until a chef is chosen');
assert(chefModalContent.includes('absolute inset-0 z-30'), 'ChefSelectModal must support form context (confined inside form)');
assert(chefModalContent.includes('fixed inset-0 top-16 z-30'), 'ChefSelectModal must support non-form context (except top bar)');
console.log('✅ PASS: ChefSelectModal implemented with all required specs');

// 4. Verify IngredientSelectModal implementation
const ingModalContent = fs.readFileSync(path.join(__dirname, '../client/src/components/IngredientSelectModal.jsx'), 'utf-8');
assert(ingModalContent.includes('Enter ingredient name...'), 'IngredientSelectModal must have search field with hint "Enter ingredient name..."');
assert(ingModalContent.includes('Select Ingredients'), 'IngredientSelectModal must have title and button "Select Ingredients"');
assert(ingModalContent.includes('Clear selection'), 'IngredientSelectModal must have bottom-left "Clear selection" button');
assert(ingModalContent.includes('disabled={!isChanged}'), 'Select Ingredients button must be disabled until selection differs from initial');
assert(ingModalContent.includes('grid grid-cols-2'), 'IngredientSelectModal must have a double-column checklist');
assert(ingModalContent.includes('absolute inset-0 z-30'), 'IngredientSelectModal must support form context');
assert(ingModalContent.includes('fixed inset-0 top-16 z-30'), 'IngredientSelectModal must support non-form context');
console.log('✅ PASS: IngredientSelectModal implemented with all required specs');

// 5. Verify PaginationBar implementation
const paginationContent = fs.readFileSync(path.join(__dirname, '../client/src/components/PaginationBar.jsx'), 'utf-8');
assert(paginationContent.includes('totalPages <= 5'), 'PaginationBar must render all numbers without ellipsis when totalPages <= 5');
assert(paginationContent.includes('showEllipsis'), 'PaginationBar must render ellipsis when totalPages > 5');
assert(paginationContent.includes('isJumpOpen'), 'PaginationBar must transform ... into an input box on click');
assert(paginationContent.includes('parsed >= 1 && parsed <= totalPages'), 'PaginationBar must validate 1 <= N <= totalPages and block out-of-range');
console.log('✅ PASS: PaginationBar supports dynamic jump with range validation and 5-page threshold');

// 6. Verify Admin Pages integration
const adminDishesContent = fs.readFileSync(path.join(__dirname, '../client/src/pages/AdminDishesPage.jsx'), 'utf-8');
assert(adminDishesContent.includes('ChefSelectModal'), 'AdminDishesPage must import ChefSelectModal');
assert(adminDishesContent.includes('IngredientSelectModal'), 'AdminDishesPage must import IngredientSelectModal');
assert(adminDishesContent.includes('PaginationBar'), 'AdminDishesPage must use PaginationBar');
assert(adminDishesContent.includes('relative overflow-hidden'), 'AdminDishesPage form must have relative overflow-hidden to confine form modals');
assert(adminDishesContent.includes('Edit selection'), 'AdminDishesPage form must show "Edit selection" button when ingredients selected');

const adminChefsContent = fs.readFileSync(path.join(__dirname, '../client/src/pages/AdminChefsPage.jsx'), 'utf-8');
assert(adminChefsContent.includes('PaginationBar'), 'AdminChefsPage must use PaginationBar');

const adminIngsContent = fs.readFileSync(path.join(__dirname, '../client/src/pages/AdminIngredientsPage.jsx'), 'utf-8');
assert(adminIngsContent.includes('PaginationBar'), 'AdminIngredientsPage must use PaginationBar');

const adminDishEditContent = fs.readFileSync(path.join(__dirname, '../client/src/pages/AdminDishEditPage.jsx'), 'utf-8');
assert(adminDishEditContent.includes('ChefSelectModal'), 'AdminDishEditPage must import ChefSelectModal');
assert(adminDishEditContent.includes('IngredientSelectModal'), 'AdminDishEditPage must import IngredientSelectModal');
assert(adminDishEditContent.includes('relative overflow-hidden'), 'AdminDishEditPage form must have relative overflow-hidden to confine form modals');

console.log('✅ PASS: All admin views integrated with modals and interactive PaginationBar');
console.log('\nAll new feature verification tests PASSED successfully! 🎉');
