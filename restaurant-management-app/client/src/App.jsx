import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

import DishesPage from './pages/DishesPage';
import DishDetailPage from './pages/DishDetailPage';
import AdminDishesPage from './pages/AdminDishesPage';
import AdminDishEditPage from './pages/AdminDishEditPage';
import AdminChefsPage from './pages/AdminChefsPage';
import AdminIngredientsPage from './pages/AdminIngredientsPage';
import NotFoundPage from './pages/NotFoundPage';
import BadRequestPage from './pages/BadRequestPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Root redirect to customer menu */}
          <Route path="/" element={<Navigate to="/dishes" replace />} />

          {/* Customer Facing Routes (3 Demo Modes) */}
          <Route path="/dishes" element={<DishesPage paginationMode="page" />} />
          <Route path="/dishes/load-more" element={<DishesPage paginationMode="load-more" />} />
          <Route path="/dishes/infinite-scroll" element={<DishesPage paginationMode="infinite-scroll" />} />
          <Route path="/dishes/:id" element={<DishDetailPage />} />

          {/* Admin Dishes Routes */}
          <Route path="/admin/dishes" element={<AdminDishesPage />} />
          <Route path="/admin/dishes/new" element={<AdminDishesPage />} />
          <Route path="/admin/dishes/:id/edit" element={<AdminDishEditPage />} />
          <Route path="/admin/dish" element={<Navigate to="/admin/dishes" replace />} />

          {/* Admin Chefs Routes */}
          <Route path="/admin/chefs" element={<AdminChefsPage />} />
          <Route path="/admin/chef" element={<Navigate to="/admin/chefs" replace />} />

          {/* Admin Ingredients Routes */}
          <Route path="/admin/ingredients" element={<AdminIngredientsPage />} />
          <Route path="/admin/ingredient" element={<Navigate to="/admin/ingredients" replace />} />

          {/* Error Pages */}
          <Route path="/bad-request" element={<BadRequestPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
