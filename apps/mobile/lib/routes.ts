/** shikkhaos://… deep link -> app route (mirrors packages/screens deepLinkToRoute). */
export function routeFor(deepLink?: string): string {
  const [head, id] = (deepLink ?? "").replace("shikkhaos://", "").split("/");
  switch (head) {
    case "results": return "/(tabs)/results"; case "attendance": return "/(tabs)/attendance"; case "messages": return id ? `/messages/${id}` : "/(tabs)/messages";
    case "notices": return "/notices"; case "homework": return id ? `/homework/${id}` : "/homework"; case "class-tests": return "/class-tests"; default: return "/notifications";
  }
}
