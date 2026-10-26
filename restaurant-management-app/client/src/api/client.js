/**
 * RestaurantApiClient - Centralized API Service Class
 *
 * Requirements addressed:
 * 1. All API calls gathered in ONE single class.
 * 2. Original URL and headers located in ONE spot (constructor) for easy maintenance.
 * 3. Validating the 3 levels of error in ONE central place:
 *    - Level 1: Connection error and CORS blocking (Network failure, fetch exception, CORS reject).
 *    - Level 2: Wrong URL or system error (HTTP 404, HTTP 500, non-200 technical status without 'ok').
 *    - Level 3: Business logic error reads error code (HTTP 200 with ok: false, e.g. VALIDATION_FAILED, NOT_FOUND).
 * 4. Resource-Based URLs:
 *    - GET /dishes: get all dishes
 *    - GET /dishes/:id: get specific dish with that id
 *    - POST /admin/...: add new dish / chef / ingredient
 *    - POST /admin/.../:id with Method override: PATCH for updates
 *    - POST /admin/.../:id with Method override: DELETE for deletes
 * 5. Pages never make direct HTTP calls.
 */
class RestaurantApiClient {
  constructor(baseUrl = 'http://localhost:3000/api') {
    // Original base URL and default headers configured in ONE spot
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Centralized HTTP request method validating all 3 error levels
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    let response;
    // LEVEL 1: Connection error and CORS blocking
    try {
      response = await fetch(url, config);
    } catch (networkError) {
      return {
        ok: false,
        level: 1,
        error: {
          level: 1,
          code: 'CONNECTION_OR_CORS_ERROR',
          message: 'Connection failed or blocked by CORS. Please ensure the API server is running and client origin is authorized.',
          details: networkError.message
        }
      };
    }

    // Safely parse JSON
    let json = null;
    try {
      json = await response.json();
    } catch (parseError) {
      json = null;
    }

    // LEVEL 2: Wrong URL or system error (HTTP 404, 500, non-200 technical status without 'ok')
    if (!response.ok) {
      const is404 = response.status === 404;
      return {
        ok: false,
        status: response.status,
        level: 2,
        error: {
          level: 2,
          status: response.status,
          code: is404 ? 'INVALID_URL' : 'SYSTEM_ERROR',
          message: json?.message || (is404 ? `The requested endpoint was not found (404): ${endpoint}` : 'A technical server error occurred.'),
          technicalDetails: json
        }
      };
    }

    // LEVEL 3: Business logic error reads error code (HTTP 200 with ok: false)
    if (json && json.ok === false) {
      return {
        ok: false,
        status: 200,
        level: 3,
        error: {
          level: 3,
          code: json.error?.code || 'BUSINESS_LOGIC_ERROR',
          message: json.error?.message || 'A business logic error occurred.',
          fields: json.error?.fields || null
        }
      };
    }

    // Success response
    return json;
  }

  // ==========================================================
  // CUSTOMER RESOURCE ENDPOINTS
  // ==========================================================

  /**
   * GET /dishes: Get all dishes with server-paging, search, and category support
   */
  getDishes(params = {}) {
    let query = '';
    if (typeof params === 'string') {
      if (params && params !== 'All') query = `?category=${encodeURIComponent(params)}`;
    } else if (params && typeof params === 'object') {
      const qp = new URLSearchParams();
      if (params.page !== undefined && params.page !== null) qp.set('page', params.page);
      if (params.pageSize !== undefined && params.pageSize !== null) qp.set('pageSize', params.pageSize);
      if (params.search && typeof params.search === 'string' && params.search.trim().length > 0) {
        qp.set('search', params.search.trim());
      }
      if (params.category && params.category !== 'All') qp.set('category', params.category);
      const str = qp.toString();
      if (str) query = `?${str}`;
    }
    return this.request(`/dishes${query}`, { method: 'GET' });
  }

  /**
   * GET /dishes/:id: Get a specific dish with that id
   */
  getDish(id) {
    return this.request(`/dishes/${id}`, { method: 'GET' });
  }

  // ==========================================================
  // ADMIN RESOURCE ENDPOINTS
  // ==========================================================

  /**
   * GET /admin/dishes: Get dishes for admin with server-paging, filters, and sorting
   */
  getAdminDishes(params = {}) {
    const qp = new URLSearchParams();
    if (params.page !== undefined && params.page !== null) qp.set('page', params.page);
    if (params.pageSize !== undefined && params.pageSize !== null) qp.set('pageSize', params.pageSize);
    if (params.category && params.category !== 'All') qp.set('category', params.category);
    if (params.chefId && params.chefId !== 'All') qp.set('chefId', params.chefId);
    if (params.ingredientId && params.ingredientId !== 'All') qp.set('ingredientId', params.ingredientId);
    if (params.available !== undefined && params.available !== null && params.available !== 'All') {
      qp.set('available', params.available);
    }
    if (params.status && params.status !== 'All') qp.set('status', params.status);
    if (params.sortBy) qp.set('sortBy', params.sortBy);
    if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
    const str = qp.toString();
    const query = str ? `?${str}` : '';
    return this.request(`/admin/dishes${query}`, { method: 'GET' });
  }

  /**
   * POST /admin/dishes: Add a new dish
   */
  createDish(dishData) {
    return this.request('/admin/dishes', {
      method: 'POST',
      body: JSON.stringify(dishData)
    });
  }

  /**
   * POST /admin/dishes/:id with Method override: PATCH
   */
  updateDish(id, dishData) {
    return this.request(`/admin/dishes/${id}`, {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'PATCH'
      },
      body: JSON.stringify({
        ...dishData,
        _method: 'PATCH'
      })
    });
  }

  /**
   * POST /admin/dishes/:id with Method override: DELETE
   */
  deleteDish(id) {
    return this.request(`/admin/dishes/${id}`, {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'DELETE'
      },
      body: JSON.stringify({
        _method: 'DELETE'
      })
    });
  }

  // ---------------- CHEFS ----------------

  /**
   * GET /admin/chefs: Get all chefs with optional server-paging, filter, and sorting
   */
  getChefs(params = {}) {
    const qp = new URLSearchParams();
    if (params.page !== undefined && params.page !== null) qp.set('page', params.page);
    if (params.pageSize !== undefined && params.pageSize !== null) qp.set('pageSize', params.pageSize);
    if (params.specialty && params.specialty.trim()) qp.set('specialty', params.specialty.trim());
    if (params.sortBy) qp.set('sortBy', params.sortBy);
    if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
    const str = qp.toString();
    const query = str ? `?${str}` : '';
    return this.request(`/admin/chefs${query}`, { method: 'GET' });
  }

  /**
   * GET /admin/chefs/:id: Get specific chef
   */
  getChef(id) {
    return this.request(`/admin/chefs/${id}`, { method: 'GET' });
  }

  /**
   * POST /admin/chefs: Add a new chef
   */
  createChef(chefData) {
    return this.request('/admin/chefs', {
      method: 'POST',
      body: JSON.stringify(chefData)
    });
  }

  /**
   * POST /admin/chefs/:id with Method override: PATCH
   */
  updateChef(id, chefData) {
    return this.request(`/admin/chefs/${id}`, {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'PATCH'
      },
      body: JSON.stringify({
        ...chefData,
        _method: 'PATCH'
      })
    });
  }

  /**
   * POST /admin/chefs/:id with Method override: DELETE
   */
  deleteChef(id) {
    return this.request(`/admin/chefs/${id}`, {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'DELETE'
      },
      body: JSON.stringify({
        _method: 'DELETE'
      })
    });
  }

  // ---------------- INGREDIENTS ----------------

  /**
   * GET /admin/ingredients: Get all ingredients with optional server-paging, filter, and sorting
   */
  getIngredients(params = {}) {
    const qp = new URLSearchParams();
    if (params.page !== undefined && params.page !== null) qp.set('page', params.page);
    if (params.pageSize !== undefined && params.pageSize !== null) qp.set('pageSize', params.pageSize);
    if (params.unit && params.unit !== 'All') qp.set('unit', params.unit);
    if (params.sortBy) qp.set('sortBy', params.sortBy);
    if (params.sortOrder) qp.set('sortOrder', params.sortOrder);
    const str = qp.toString();
    const query = str ? `?${str}` : '';
    return this.request(`/admin/ingredients${query}`, { method: 'GET' });
  }

  /**
   * GET /admin/ingredients/:id: Get specific ingredient
   */
  getIngredient(id) {
    return this.request(`/admin/ingredients/${id}`, { method: 'GET' });
  }

  /**
   * POST /admin/ingredients: Add a new ingredient
   */
  createIngredient(ingData) {
    return this.request('/admin/ingredients', {
      method: 'POST',
      body: JSON.stringify(ingData)
    });
  }

  /**
   * POST /admin/ingredients/:id with Method override: PATCH
   */
  updateIngredient(id, ingData) {
    return this.request(`/admin/ingredients/${id}`, {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'PATCH'
      },
      body: JSON.stringify({
        ...ingData,
        _method: 'PATCH'
      })
    });
  }

  /**
   * POST /admin/ingredients/:id with Method override: DELETE
   */
  deleteIngredient(id) {
    return this.request(`/admin/ingredients/${id}`, {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'DELETE'
      },
      body: JSON.stringify({
        _method: 'DELETE'
      })
    });
  }
}

// Export single instance for application-wide use
export const api = new RestaurantApiClient();
export default api;
