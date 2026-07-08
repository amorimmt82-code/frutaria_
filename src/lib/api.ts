import {
  AdminBootstrap,
  AdminLoginResponse,
  AccountSessionResponse,
  CheckoutPayload,
  CheckoutResponse,
  CustomerAccount,
  OrderStatus,
  PaymentSettings,
  PaymentStatus,
  Product,
  StorefrontConfigResponse,
} from '../types';

const API_UNAVAILABLE_MESSAGE = 'Nao foi possivel ligar ao servidor. Arranque a app com npm run dev ou use o servidor Express em producao.';
const API_INVALID_RESPONSE_MESSAGE = 'O frontend recebeu uma pagina HTML em vez da API. Use npm run preview ou npm run dev para abrir a aplicacao completa.';

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(path, {
      ...options,
      credentials: options.credentials || 'same-origin',
      headers,
    });
  } catch {
    throw new Error(API_UNAVAILABLE_MESSAGE);
  }

  const contentType = response.headers.get('content-type') || '';
  const isJsonResponse = contentType.toLowerCase().includes('application/json');
  const data = isJsonResponse
    ? await response.json().catch(() => ({})) as Record<string, unknown>
    : {};

  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Pedido não concluído.');
  }

  if (!isJsonResponse) {
    throw new Error(API_INVALID_RESPONSE_MESSAGE);
  }

  return data as T;
}

export function getCatalog() {
  return apiRequest<{ products: Product[] }>('/api/catalog');
}

export function getStorefrontConfig() {
  return apiRequest<StorefrontConfigResponse>('/api/storefront-config');
}

export function accountRegister(payload: { name: string; phone: string; password?: string }) {
  return apiRequest<{ account: CustomerAccount }>('/api/account/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function accountLogin(payload: { phone: string; password?: string }) {
  return apiRequest<{ account: CustomerAccount }>('/api/account/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function accountLogout() {
  return apiRequest<{ loggedOut: boolean }>('/api/account/logout', {
    method: 'POST',
  });
}

export function getAccountMe() {
  return apiRequest<AccountSessionResponse>('/api/account/me');
}

export function checkout(payload: CheckoutPayload) {
  return apiRequest<CheckoutResponse>('/api/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function confirmStripePayment(orderId: string, paymentIntentId: string) {
  return apiRequest<{ paymentStatus: string }>('/api/checkout/stripe/confirm', {
    method: 'POST',
    body: JSON.stringify({ orderId, paymentIntentId }),
  });
}

export function adminLogin(email: string, passcode: string) {
  return apiRequest<AdminLoginResponse>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, passcode }),
  });
}

export function adminLogout(csrfToken: string) {
  return apiRequest<{ loggedOut: boolean }>('/api/admin/logout', {
    method: 'POST',
    headers: adminHeaders(csrfToken),
  });
}

function adminHeaders(csrfToken?: string) {
  return csrfToken
    ? {
        'x-admin-csrf-token': csrfToken,
      }
    : undefined;
}

export function getAdminBootstrap() {
  return apiRequest<AdminBootstrap>('/api/admin/bootstrap');
}

export function createProduct(csrfToken: string, product: Omit<Product, 'id'>) {
  return apiRequest<{ product: Product }>('/api/admin/products', {
    method: 'POST',
    headers: adminHeaders(csrfToken),
    body: JSON.stringify(product),
  });
}

export function updateProduct(csrfToken: string, productId: string, product: Omit<Product, 'id'>) {
  return apiRequest<{ product: Product }>(`/api/admin/products/${productId}`, {
    method: 'PUT',
    headers: adminHeaders(csrfToken),
    body: JSON.stringify(product),
  });
}

export function deleteProduct(csrfToken: string, productId: string) {
  return apiRequest<{ deleted?: boolean; archived?: boolean; product?: Product }>(`/api/admin/products/${productId}`, {
    method: 'DELETE',
    headers: adminHeaders(csrfToken),
  });
}

export function updateOrder(csrfToken: string, orderId: string, payload: { orderStatus: OrderStatus; paymentStatus: PaymentStatus; notes: string }) {
  return apiRequest(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    headers: adminHeaders(csrfToken),
    body: JSON.stringify(payload),
  });
}

export function updatePaymentSettings(csrfToken: string, settings: PaymentSettings) {
  return apiRequest<{ paymentSettings: PaymentSettings }>('/api/admin/payment-settings', {
    method: 'PUT',
    headers: adminHeaders(csrfToken),
    body: JSON.stringify(settings),
  });
}