import "@fortawesome/fontawesome-free/css/all.min.css";
import "../styles/base.css";
import "./rpgs.css";
import { FileManagerPage } from "./FileManagerPage";
import { mountToasts } from "./toasts";

mountToasts();
new FileManagerPage().mount(document.getElementById("app") as HTMLElement);
