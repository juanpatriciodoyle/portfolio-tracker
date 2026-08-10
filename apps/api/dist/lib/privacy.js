"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashUserIdentity = hashUserIdentity;
const crypto_1 = __importDefault(require("crypto"));
const SALT = process.env.USER_HASH_SALT || 'portfolio-tracker-zero-knowledge-privacy-salt-2026';
/**
 * Converts a raw user identity string (e.g. Google ID or email) into an irreversible
 * SHA-256 cryptographic hash so no personal identifying information (PII) is stored in DB.
 */
function hashUserIdentity(rawId) {
    return crypto_1.default.createHmac('sha256', SALT).update(rawId.trim().toLowerCase()).digest('hex');
}
