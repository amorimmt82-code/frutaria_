/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';

/** Marcador de unidade usado quando um produto vendido a kg é comprado à unidade. */
export const UNIT_SALE_UNIT = 'un';

/**
 * Peso médio mínimo (em gramas) aceite para a venda à unidade. Evita que se
 * configurem valores absurdos (ex.: 1g) que dariam preços por unidade irreais.
 */
export const MIN_AVG_WEIGHT_GRAMS = 10;

export function isKgUnit(unit?: string): boolean {
  return (unit || '').trim().toLowerCase() === 'kg';
}

/** O produto tem peso médio por unidade configurado (em gramas)? */
export function hasAverageWeight(product: Pick<Product, 'approxWeightGrams'>): boolean {
  return typeof product.approxWeightGrams === 'number' && product.approxWeightGrams > 0;
}

/**
 * Produto vendido a kg que também pode ser comprado à unidade, com o preço
 * calculado automaticamente a partir do peso médio.
 */
export function supportsUnitSale(product: Product): boolean {
  return isKgUnit(product.unit) && hasAverageWeight(product);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Preço por unidade calculado a partir do preço/kg e do peso médio (gramas). */
export function unitPriceFromWeight(pricePerKg: number, grams: number): number {
  return round2(pricePerKg * (grams / 1000));
}

/**
 * Preço efetivo de 1 unidade do produto. Para produtos kg com peso médio,
 * devolve o preço calculado; caso contrário devolve o preço base.
 */
export function effectiveUnitPrice(product: Product): number {
  if (supportsUnitSale(product)) {
    return unitPriceFromWeight(product.price, product.approxWeightGrams as number);
  }
  return product.price;
}

/** Formata gramas em "190g" ou "1,4kg". */
export function formatGrams(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return '';
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${kg.toFixed(grams % 1000 === 0 ? 0 : 2).replace('.', ',')}kg`;
  }
  return `${Math.round(grams)}g`;
}

/** Formata um valor em euros como "0,32€". */
export function formatEuro(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}€`;
}
