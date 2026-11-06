function validateId(req, res, next, value) {
  if (!/^\d{1,19}$/.test(value) || BigInt(value) < 1n || BigInt(value) > 9223372036854775807n) {
    return res.status(404).render("errors/404", { title: "Record not found" });
  }
  next();
}

module.exports = { validateId };
