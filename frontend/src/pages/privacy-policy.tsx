import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

type Subsection = {
  title?: string;
  intro?: string;
  bullets?: string[];
};

type Section = {
  title: string;
  paragraphs?: string[];
  paragraphNodes?: ReactNode[];
  intro?: string;
  bullets?: string[];
  subsections?: Subsection[];
  outro?: string[];
  outroNodes?: ReactNode[];
};

const SECTIONS: Section[] = [
  {
    title: "1. Information We Collect",
    paragraphs: ["We collect the following types of information:"],
    subsections: [
      {
        title: "a. Personal Information",
        bullets: [
          "Name",
          "Email address",
          "Phone number (if provided)",
          "Profile details (bio, preferences, etc.)",
        ],
      },
      {
        title: "b. Usage Information",
        bullets: [
          "Interactions with coaches and services",
          "Bookings and session activity",
          "Platform usage data (pages visited, clicks, etc.)",
        ],
      },
      {
        title: "c. Payment-Related Information",
        intro:
          "Riplect does not process payments directly. However, we may collect:",
        bullets: [
          "Payment confirmation details",
          "Uploaded proof of payment (e.g., screenshots)",
        ],
      },
      {
        title: "d. Coach-Shared Data",
        intro: "Coaches may store or access:",
        bullets: ["Session notes", "Client progress or shared materials"],
      },
    ],
  },
  {
    title: "2. How We Use Your Information",
    intro: "We use your information to:",
    bullets: [
      "Provide and improve our platform",
      "Connect users with coaches",
      "Facilitate bookings and service delivery",
      "Verify payments (via submitted proof)",
      "Communicate with you (updates, support, etc.)",
      "Ensure platform safety and prevent misuse",
    ],
  },
  {
    title: "3. How Payments Work",
    paragraphs: [
      "Riplect acts as a discovery and facilitation platform, not a payment processor.",
    ],
    bullets: [
      "Payments are completed through third-party external links",
      "We are not responsible for payment processing, refunds, or disputes",
      "Users must confirm payment on the platform after completing transactions externally",
    ],
  },
  {
    title: "4. Sharing of Information",
    paragraphs: ["We may share information:"],
    subsections: [
      {
        title: "a. With Coaches",
        bullets: [
          "When you book or interact with a coach",
          "To enable service delivery",
        ],
      },
      {
        title: "b. With Service Providers",
        bullets: ["Hosting, analytics, and technical infrastructure providers"],
      },
      {
        title: "c. Legal Requirements",
        bullets: ["If required by law or to protect rights and safety"],
      },
    ],
    outro: ["We do not sell your personal data."],
  },
  {
    title: "5. Data Storage and Security",
    intro: "We take reasonable measures to protect your data, including:",
    bullets: [
      "Secure servers and infrastructure",
      "Access controls",
      "Data minimization practices",
    ],
    outro: ["However, no system is 100% secure."],
  },
  {
    title: "6. Your Rights",
    intro: "Depending on your location, you may have the right to:",
    bullets: [
      "Access your data",
      "Correct inaccurate information",
      "Request deletion of your data",
      "Withdraw consent",
    ],
    outroNodes: [
      <>
        To make a request, contact us at:{" "}
        <a
          href="mailto:riplek2025@gmail.com"
          className="text-[#b66667] underline underline-offset-2 hover:text-[#9e5556]"
          data-testid="link-privacy-rights-email"
        >
          riplek2025@gmail.com
        </a>
      </>,
    ],
  },
  {
    title: "7. Data Retention",
    intro: "We retain your data only as long as necessary to:",
    bullets: [
      "Provide services",
      "Comply with legal obligations",
      "Resolve disputes",
    ],
  },
  {
    title: "8. Third-Party Links",
    paragraphs: [
      "Riplect may contain links to third-party websites (including payment gateways). We are not responsible for their privacy practices.",
    ],
  },
  {
    title: "9. Children's Privacy",
    paragraphs: [
      "Riplect is not intended for users under the age of 18. We do not knowingly collect data from minors.",
    ],
  },
  {
    title: "10. Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.",
    ],
  },
  {
    title: "11. Contact Us",
    paragraphs: ["If you have any questions about this Privacy Policy:"],
    paragraphNodes: [
      <>
        Email:{" "}
        <a
          href="mailto:riplek2025@gmail.com"
          className="text-[#b66667] underline underline-offset-2 hover:text-[#9e5556]"
          data-testid="link-privacy-contact-email"
        >
          riplek2025@gmail.com
        </a>
      </>,
      "Company Name: Riplect",
    ],
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Privacy Policy | Riplect";

    const metaSelector = 'meta[name="description"]';
    let meta = document.head.querySelector<HTMLMetaElement>(metaSelector);
    const previousDescription = meta?.getAttribute("content") ?? null;
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "How Riplect collects, uses, and protects your information when you use the conscious creativity and wellness platform.",
    );

    return () => {
      document.title = previousTitle;
      if (created && meta?.parentNode) {
        meta.parentNode.removeChild(meta);
      } else if (meta && previousDescription !== null) {
        meta.setAttribute("content", previousDescription);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans">
      <nav className="absolute top-0 w-full z-50 pt-4 pb-2">
        <div className="max-w-7xl mx-auto pl-0 pr-4 sm:pl-0 sm:pr-6 lg:pl-0 lg:pr-8">
          <div className="flex flex-wrap justify-between items-center h-16 gap-4">
            <div className="flex items-center">
              <Link href="/">
                <img
                  src={riplekLogo1}
                  alt="Riplect"
                  className="h-11 cursor-pointer ml-2"
                  data-testid="img-header-logo"
                />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button
                  variant="ghost"
                  className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-10 bg-gradient-to-b from-[#FDF6EE]/50 to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#b66667]/3 rounded-full blur-[80px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <div className="w-14 h-14 rounded-full bg-[#FDF6EE] flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-6 h-6 text-[#b66667]" />
          </div>
          <h1
            className="text-3xl md:text-4xl lg:text-5xl font-bold text-stone-600 tracking-tight"
            data-testid="text-privacy-title"
          >
            Privacy Policy
          </h1>
          <p
            className="mt-4 text-sm md:text-base text-gray-500"
            data-testid="text-privacy-last-updated"
          >
            Last Updated: 25 April 2026
          </p>
        </div>
      </section>

      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <p
            className="text-gray-600 text-base md:text-lg leading-relaxed mb-12"
            data-testid="text-privacy-welcome"
          >
            Welcome to Riplect (“we,” “our,” or “us”). Your privacy is
            important to us. This Privacy Policy explains how we collect, use,
            and protect your information when you use our platform.
          </p>

          <div className="space-y-10">
            {SECTIONS.map((section, idx) => (
              <article
                key={section.title}
                data-testid={`section-privacy-${idx + 1}`}
              >
                <h2 className="text-xl md:text-2xl font-semibold text-stone-700 mb-4">
                  {section.title}
                </h2>

                {section.paragraphs?.map((p, i) => (
                  <p
                    key={`p-${i}`}
                    className="text-gray-600 leading-relaxed mb-3 last:mb-0"
                  >
                    {p}
                  </p>
                ))}

                {section.paragraphNodes?.map((p, i) => (
                  <p
                    key={`pn-${i}`}
                    className="text-gray-600 leading-relaxed mb-3 last:mb-0"
                  >
                    {p}
                  </p>
                ))}

                {section.intro && (
                  <p className="text-gray-600 leading-relaxed mt-3 mb-2">
                    {section.intro}
                  </p>
                )}

                {section.bullets && (
                  <ul className="list-disc pl-5 space-y-1.5 text-gray-600 leading-relaxed marker:text-[#b66667]">
                    {section.bullets.map((b, i) => (
                      <li key={`b-${i}`}>{b}</li>
                    ))}
                  </ul>
                )}

                {section.subsections && (
                  <div className="mt-4 space-y-5">
                    {section.subsections.map((sub, sIdx) => (
                      <div key={`sub-${sIdx}`}>
                        {sub.title && (
                          <h3 className="text-base md:text-lg font-medium text-stone-700 mb-2">
                            {sub.title}
                          </h3>
                        )}
                        {sub.intro && (
                          <p className="text-gray-600 leading-relaxed mb-2">
                            {sub.intro}
                          </p>
                        )}
                        {sub.bullets && (
                          <ul className="list-disc pl-5 space-y-1.5 text-gray-600 leading-relaxed marker:text-[#b66667]">
                            {sub.bullets.map((b, i) => (
                              <li key={`sub-b-${i}`}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {section.outro?.map((p, i) => (
                  <p
                    key={`o-${i}`}
                    className="text-gray-600 leading-relaxed mt-3"
                  >
                    {p}
                  </p>
                ))}

                {section.outroNodes?.map((p, i) => (
                  <p
                    key={`on-${i}`}
                    className="text-gray-600 leading-relaxed mt-3"
                  >
                    {p}
                  </p>
                ))}
              </article>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap gap-4">
            <Link href="/terms-of-service">
              <Button
                variant="outline"
                className="rounded-full border-[#b66667] text-[#b66667] hover:bg-[#FDF6EE]"
                data-testid="button-view-terms"
              >
                View Terms of Service
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                variant="ghost"
                className="rounded-full text-stone-600 hover:bg-[#FDF6EE]"
                data-testid="button-contact-from-privacy"
              >
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-gray-100 bg-[#FDF6EE]/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <img
                src={riplekLogo1}
                alt="Riplect"
                className="h-8"
                data-testid="img-footer-logo"
              />
              <span
                className="text-sm text-gray-400"
                data-testid="text-copyright"
              >
                © 2025
              </span>
            </div>
            <div className="flex flex-wrap gap-8 text-sm text-gray-500">
              <Link
                href="/about"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-about"
              >
                About
              </Link>
              <Link
                href="/terms-of-service"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-terms"
              >
                Terms
              </Link>
              <Link
                href="/privacy-policy"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-privacy"
              >
                Privacy
              </Link>
              <Link
                href="/contact"
                className="hover:text-gray-900 transition-colors"
                data-testid="link-footer-contact"
              >
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
