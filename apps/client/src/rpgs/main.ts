import "@fortawesome/fontawesome-free/css/all.min.css";
import "../styles/base.css";
import "./rpgs.css";
import { translatePage } from "@tabbletop/i18n";
import { readPreferredLanguage } from "../game/languagePreference";
import { FileManagerPage } from "./FileManagerPage";
import { mountToasts } from "./toasts";

void translatePage(readPreferredLanguage()).catch(() => undefined);
mountToasts();
new FileManagerPage().mount(document.getElementById("app") as HTMLElement);
