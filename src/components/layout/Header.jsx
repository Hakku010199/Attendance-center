import Icon from "../common/Icon.jsx";

// Mobile top-bar (menu + brand). Desktop topbar removed per design request.
export default function Header({ center, onMenu }) {
  return (
    <div className="office-topbar">
      <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" />
      </button>
      <div className="office-brand">
        <span className="brand-logo brand-logo--sm"><Icon name="logo" size={18} /></span>
        <b>{center.name}</b>
      </div>
    </div>
  );
}

