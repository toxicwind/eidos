import { discoverDropins, infraDropins, renderDropinsToml } from "./src/scaffold-services.ts";
const a = discoverDropins();
console.log("all count", a.length);
a.filter((d) => /qdrant|hindsight|kafka|redis/i.test(d.id)).forEach((d) => console.log(" ", d.id, d.envVar, d.port));
console.log("infra:");
console.log(renderDropinsToml(infraDropins()));