import { CANONICAL_RATE_LIMIT_IP } from "./prebody-rate-limit.js";

/**
 * Réécrit les en-têtes d'adresse à partir de req.ip, donc après application de
 * la configuration Express `trust proxy`. Lorsqu'un garde-fou précoce a déjà
 * ramené une nouvelle adresse vers la clé d'overflow, cette clé est conservée
 * afin de borner également les Maps des anciens limiteurs.
 */
export function trustedClientIpMiddleware(req, _res, next) {
  const boundedIp = req[CANONICAL_RATE_LIMIT_IP];
  const trustedIp = String(
    boundedIp || req.ip || req.socket?.remoteAddress || "",
  ).trim();

  if (trustedIp) {
    req.headers["x-forwarded-for"] = trustedIp;
    req.headers["x-real-ip"] = trustedIp;
  } else {
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-real-ip"];
  }
  next();
}
