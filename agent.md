# Portfolio Specification — Andranik Grigoryan

This document describes the current state, design rules, and content of the portfolio site.

---

## Appearance

- Minimalistic and professional — no terminal aesthetics, no gimmicks
- Light background (`#ffffff` / `#f8fafc`), dark slate text (`#0f172a`), blue accent (`#1d4ed8`)
- System font stack (Inter → -apple-system → Segoe UI → Roboto)
- No education section

---

## Page Structure (top to bottom)

1. **Nav** — Name brand | Experience · Skills · Certifications · Contact links | Download CV button
2. **Hero** — Name, title eyebrow, tagline, CTA buttons (Get in Touch / GitHub / LinkedIn)
3. **Experience** — First content section
4. **Skills** — Six skill groups as tag cards
5. **Certifications** — Two cert cards
6. **Contact** — Email, GitHub, LinkedIn, Download CV (PDF)
7. **Footer**

---

## Content

### Experience

**1. Codedcloud — DevOps Engineer (Contract)**
2025 – Present · 10 mos

- Configured observability stack handling 1 TB/day of telemetry (logs, traces, metrics), achieving 90% service monitoring coverage and improving incident response management
- Implemented infrastructure-as-code for CDN configuration, establishing a controlled change process that significantly reduced manual errors
- Optimised CI/CD pipelines, cutting total deployment time from 30 to 12 minutes
- Automated manual operational tasks, reducing incidents and improving business processes

---

**2. Codeex — DevOps Engineer (Full-time · On-site)**
2024 – 2025 · 1 yr 6 mos · Yerevan, Armenia

- Migrated manually configured AWS environment to 100% IaC coverage, significantly improving security, auditability, and operational consistency
- Designed and deployed a business-critical custom DNS service handling 200M+ requests/day across 6 regions
- Reduced infrastructure costs by 30% through targeted optimisation initiatives
- Built observability and incident response management systems, improving service availability and SLA compliance
- Managed and acheaved SOC2, AWS Partneres program infrastructure grades

---

**3. Goya CJSC — DevOps Engineer (Full-time · On-site)**
2022 – 2024 · 2 yrs 9 mos · Yerevan, Armenia

- Designed and implemented on-premise Kubernetes infrastructure serving as an Internal Developer Platform (IDP)
- Led the project from scope definition through final delivery
- Collaborated with management and supply teams to ensure smooth project delivery operations

---

**4. Stone Valley LLC — DevOps Engineer (Full-time · Remote)**
Jun 2020 – Jul 2022 · 2 yrs 2 mos · Yerevan, Armenia

- Deployed and maintained ELK stack (Elasticsearch, Logstash, Kibana) for centralised log aggregation and real-time monitoring across production services
- Built and managed Azure cloud infrastructure, supporting application workloads and ensuring high availability
- Designed and implemented CI/CD pipelines, improving release automation and reducing deployment friction
- Administered Linux-based server environments and automated routine operational tasks using Bash and Python

---

### Skills

| Group | Tags |
|---|---|
| Cloud & Infrastructure | AWS, GCP, Terraform, Ansible |
| Containers & Orchestration | Kubernetes, Docker, Helm, ArgoCD |
| CI/CD & GitOps | GitHub Actions, GitLab CI, Jenkins, FluxCD |
| Observability | Prometheus, Grafana, Loki, OpenTelemetry |
| Networking & DNS | MikroTik, BGP, DNS, CDN |
| Languages & Scripting | Bash, Python, Go, HCL |

---

### Certifications

- **Certified Kubernetes Administrator (CKA)** — Linux Foundation
- **AWS Certified Solutions Architect** — Amazon Web Services

---

### Links & Actions

- GitHub: `https://github.com/yourusername` ← replace with real URL
- LinkedIn: `https://linkedin.com/in/yourusername` ← replace with real URL
- Email: `your@email.com` ← replace with real email
- Download CV: links to `cv.pdf` in repo root ← add the actual PDF file

---

## Technical Notes

- Pure HTML5 / CSS3 / vanilla JS — zero build step
- Deployed via GitHub Actions → GitHub Pages (`master` branch)
- Workflow: `.github/workflows/deploy.yml` — validates HTML + CSS on PRs, deploys on push to `master`
- GitHub Pages source must be set to "GitHub Actions" in repo Settings → Pages



### Links & Actions (resolved)

- GitHub: https://github.com/andranikasd
- LinkedIn: https://www.linkedin.com/in/andranik-grigoryan/
- Email: theandranikgrigoryan@gmail.com
- `cv.pdf` — generated from `cv.html` via Chrome headless; regenerate with:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --print-to-pdf="$(pwd)/cv.pdf" --no-pdf-header-footer "file://$(pwd)/cv.html"`
- Favicon: SVG data-URI with "AG" initials on blue `#1d4ed8` background, embedded in `<head>`