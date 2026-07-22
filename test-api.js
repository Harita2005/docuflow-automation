async function test() {
  try {
    const res = await fetch("http://127.0.0.1:5173/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "EMP-9999", password: "password" })
    });
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("BODY:", text);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();
