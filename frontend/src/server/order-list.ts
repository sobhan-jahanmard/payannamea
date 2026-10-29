import type { EntityManager } from "typeorm";

import { getDataSource } from "./db/data-source";
import { OrderSchema, type UserEntity } from "./db/entities";
import { normalizeOrderSearch, orderListQuerySchema, orderSearchExpression, orderSearchPattern, type OrderListQuery } from "./order-search";

type ListUser = Pick<UserEntity, "id" | "role">;

export function createOrderListQuery(manager: EntityManager, user: ListUser, query: OrderListQuery) {
  const builder = manager.getRepository(OrderSchema).createQueryBuilder("orders");
  const scopeColumn = user.role === "customer" ? "user_id" : "created_by_user_id";
  const scope = (alias: string) => user.role === "admin" ? "true" : `${alias}.${scopeColumn} = :viewerId`;
  builder.where(scope("orders"), { viewerId: user.id });

  if (normalizeOrderSearch(query.search)) {
    // Separate branches let PostgreSQL use both trigram indexes rather than
    // evaluating an OR across joined tables. UNION also removes duplicate hits.
    builder.andWhere(`orders.id IN (
      SELECT name_match.id FROM orders name_match
      WHERE ${scope("name_match")}
        AND ${orderSearchExpression("name_match.student_name")} LIKE :pattern ESCAPE '\\'
      UNION
      SELECT phone_match.id FROM users customer_match
      JOIN orders phone_match ON phone_match.user_id = customer_match.id
      WHERE ${scope("phone_match")}
        AND ${orderSearchExpression("customer_match.phone")} LIKE :pattern ESCAPE '\\'
    )`, { pattern: orderSearchPattern(query.search) });
  }

  return builder;
}

export async function findOrdersPage(manager: EntityManager, user: ListUser, query: OrderListQuery) {
  const builder = createOrderListQuery(manager, user, query);
  const total = await builder.getCount();
  const pages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, pages);
  const orders = total ? await builder
    .leftJoinAndSelect("orders.customer", "customer")
    .leftJoinAndSelect("orders.created_by", "created_by")
    .orderBy("orders.created_at", "DESC")
    .addOrderBy("orders.id", "DESC")
    .offset((page - 1) * query.limit)
    .limit(query.limit)
    .getMany() : [];

  return { orders, pagination: { page, limit: query.limit, total, pages } };
}

export async function listOrdersPage(user: ListUser, rawQuery: unknown) {
  const query = orderListQuerySchema.parse(rawQuery);
  const dataSource = await getDataSource();
  return findOrdersPage(dataSource.manager, user, query);
}
