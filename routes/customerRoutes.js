/**
 * routes/customerRoutes.js
 * Admin-facing customer (reader) management — mounted at /api/customers
 */
import { Router } from "express";
import {
  listCustomers, getCustomerById, toggleCustomerStatus, deleteCustomer,
} from "../controllers/customerController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.get("/", requirePermission("view-users"), listCustomers);
router.get("/:id", requirePermission("view-users"), getCustomerById);
router.patch("/:id/toggle-status", requirePermission("edit-users"), toggleCustomerStatus);
router.delete("/:id", requirePermission("delete-users"), deleteCustomer);

export default router;
