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
 * 4. Resource-Based URLs
 * 5. Pages never make direct HTTP calls.
 */
class RestaurantApiClient {
  constructor(baseUrl = 'http://localhost:3000/api') {
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
      credentials: 'include', // Ensure cookies (auth_token) are sent across origins
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
      const is429 = response.status === 429;
      return {
        ok: false,
        status: response.status,
        level: 2,
        requireCaptcha: json?.requireCaptcha || false,
        error: {
          level: 2,
          status: response.status,
          code: json?.error?.code || (is429 ? 'TOO_MANY_ATTEMPTS' : is404 ? 'INVALID_URL' : 'SYSTEM_ERROR'),
          message: json?.error?.message || json?.message || (is404 ? `The requested endpoint was not found: ${endpoint}` : 'A technical server error occurred.'),
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
        requireCaptcha: json?.requireCaptcha || false,
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
  // AUTHENTICATION RESOURCE ENDPOINTS
  // ==========================================================

  /**
   * Get current authenticated user
   */
  getCurrentUser() {
    return this.request('/auth/me', { method: 'GET' });
  }

  /**
   * Get auth config (reCAPTCHA site key)
   */
  getAuthConfig() {
    return this.request('/auth/config', { method: 'GET' });
  }

  /**
   * POST /api/auth/register
   */
  register(data) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * POST /api/auth/activation
   */
  activate(data) {
    return this.request('/auth/activation', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * POST /api/auth/activation/resend
   */
  resendActivation(data) {
    return this.request('/auth/activation/resend', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * POST /api/auth/login
   */
  login(data) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * POST /api/auth/logout
   */
  logout() {
    return this.request('/auth/logout', {
      method: 'POST'
    });
  }

  /**
   * POST /api/auth/forget
   */
  forgetPassword(data) {
    return this.request('/auth/forget', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * POST /api/auth/reset
   */
  resetPassword(data) {
    return this.request('/auth/reset', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // ==========================================================
  // CUSTOMER RESOURCE ENDPOINTS
  // ==========================================================

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

  getDish(id) {
    return this.request(`/dishes/${id}`, { method: 'GET' });
  }

  // ==========================================================
  // ADMIN RESOURCE ENDPOINTS
  // ==========================================================

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

  createDish(dishData) {
    return this.request('/admin/dishes', {
      method: 'POST',
      body: JSON.stringify(dishData)
    });
  }

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

  getChef(id) {
    return this.request(`/admin/chefs/${id}`, { method: 'GET' });
  }

  createChef(chefData) {
    return this.request('/admin/chefs', {
      method: 'POST',
      body: JSON.stringify(chefData)
    });
  }

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

  getIngredient(id) {
    return this.request(`/admin/ingredients/${id}`, { method: 'GET' });
  }

  createIngredient(ingData) {
    return this.request('/admin/ingredients', {
      method: 'POST',
      body: JSON.stringify(ingData)
    });
  }

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

export const api = new RestaurantApiClient();
export default api;
