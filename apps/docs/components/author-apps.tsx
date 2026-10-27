import Image from "next/image";

import { ArrowUpRight } from "lucide-react";

/** Each link says where the visit came from: UTM for the sites, `ct` for App Store Connect. */
const apps = [
  {
    name: "Curvinha",
    icon: "/apps/curvinha.png",
    line: "Interior design for iPhone. Show your room and get a 3D proposal with real furniture from Brazilian stores.",
    site: "https://curvinha.app/?utm_source=magic-modal&utm_medium=docs",
    appStore:
      "https://apps.apple.com/br/app/id6816957870?pt=126480814&ct=magic-modal-docs",
  },
  {
    name: "Pegada",
    icon: "/apps/pegada.png",
    line: "A new friend for your dog, nearby. Built with Expo, and it ships Magic Modal in production.",
    site: "https://pegada.app/?utm_source=magic-modal&utm_medium=docs",
    appStore:
      "https://apps.apple.com/br/app/id6450865592?pt=126480814&ct=magic-modal-docs",
  },
] as const;

export const AuthorApps = () => (
  <section aria-labelledby="mm-apps-title" className="mm-apps">
    <div className="mm-apps-heading" data-reveal>
      <span>FROM THE AUTHOR</span>
      <h2 id="mm-apps-title">Apps I build</h2>
      <p>I’m Gabriel Taveira. Besides Magic Modal, I build these two.</p>
    </div>
    <ul className="mm-apps-list" data-reveal>
      {apps.map((app) => (
        <li key={app.name}>
          <Image alt="" height={56} src={app.icon} unoptimized width={56} />
          <div>
            <a className="mm-apps-name" href={app.site}>
              {app.name}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
            <p>{app.line}</p>
            <a className="mm-apps-store" href={app.appStore}>
              {`${app.name} on the App Store`}
            </a>
          </div>
        </li>
      ))}
    </ul>
  </section>
);
