import { getDataSource } from "./db/data-source";

export interface ServicePricing {
  order_type: string;
  unit: "page" | "slide";
  price_per_unit_toman: number;
  estimate_quantity: number;
}

export async function getServicePricing(): Promise<ServicePricing[]> {
  const dataSource = await getDataSource();
  return dataSource.query(`SELECT order_type, unit, price_per_unit_toman, estimate_quantity
    FROM service_pricing`);
}
