
export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    service: "MY MARINE Tide API",
    message: "API server is working"
  });
}

