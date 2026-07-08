/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  image: string;
  description: string;
  variants?: string[];
  /** Peso aproximado por unidade (em gramas). Apenas relevante quando unit !== 'kg'. */
  approxWeightGrams?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem extends Product {
  quantity: number;
  selectedUnit?: string;
  variant?: string;
}

export type PaymentMethod = 'mbway' | 'transferencia' | 'dinheiro' | 'stripe';

export type OrderStatus = 'awaiting_payment' | 'awaiting_transfer' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export type PaymentStatus = 'pending' | 'awaiting_payment' | 'awaiting_transfer' | 'paid' | 'cash_on_delivery' | 'failed' | 'cancelled';

export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  deliveryDay?: 'quinta' | 'sexta';
}

export interface OrderItem {
  productId: string;
  name: string;
  image: string;
  unit: string;
  selectedUnit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  customer: CustomerDetails;
  items: OrderItem[];
  subtotal: number;
  total: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  paymentReference?: string;
  /** Notas internas do administrador (back office). */
  notes?: string;
  /** Observação escrita pelo cliente no cesto. */
  customerNote?: string;
}

export interface PaymentSettings {
  stripeEnabled: boolean;
  mbwayEnabled: boolean;
  transferEnabled: boolean;
  cashEnabled: boolean;
  mbwayNumber: string;
  transferRecipient: string;
  transferIban: string;
  transferBank: string;
  transferInstructions: string;
  updatedAt?: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  externalReference?: string;
  note?: string;
}

export interface DashboardData {
  counts: {
    products: number;
    activeProducts: number;
    orders: number;
    payments: number;
  };
  revenue: number;
  recentOrders: Order[];
}

export interface CheckoutPayload {
  customer: CustomerDetails;
  paymentMethod: PaymentMethod;
  items: Array<{
    productId: string;
    quantity: number;
    selectedUnit?: string;
    variant?: string;
  }>;
  notes?: string;
  /** Observação livre escrita pelo cliente no cesto. */
  customerNote?: string;
}

export interface CheckoutResponse {
  order: Order;
  clientSecret?: string;
  paymentSettings: PaymentSettings;
}

export interface StorefrontConfigResponse {
  paymentSettings: PaymentSettings;
}

export interface AdminLoginResponse {
  csrfToken: string;
  expiresAt: number;
}

export interface CustomerAccount {
  id: string;
  name: string;
  phone: string;
  /** true quando a conta tem palavra-passe definida. */
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSessionResponse {
  account: CustomerAccount;
  orders: Order[];
}

export interface AdminBootstrap {
  csrfToken: string;
  dashboard: DashboardData;
  products: Product[];
  orders: Order[];
  payments: PaymentRecord[];
  paymentSettings: PaymentSettings;
}
