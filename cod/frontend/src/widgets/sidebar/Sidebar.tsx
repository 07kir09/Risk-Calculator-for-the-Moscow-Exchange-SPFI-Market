import { BarChart3, CloudUpload, Flame, LayoutDashboard, ShieldAlert, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";
import { HealthIndicator } from "../status/HealthIndicator";

const navItems = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/portfolio-builder", label: "Портфель", icon: WalletCards },
  { to: "/data-upload", label: "Загрузка данных", icon: CloudUpload },
  { to: "/portfolio-risk", label: "Риск портфеля", icon: ShieldAlert },
  { to: "/scenario-risk", label: "Сценарный риск", icon: BarChart3 },
  { to: "/stress-testing", label: "Стресс-тесты", icon: Flame },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand-title">Риск-калькулятор</div>
        <div className="small-muted">Опционный риск</div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? " sidebar-link-active" : ""}`}
            >
              <Icon size={16} />
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <HealthIndicator />
    </aside>
  );
}
