/** Built-in replacements for the generic core templates that packages reference by path. */
export const CORE_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  "templates/generic/form-footer.hbs": `<footer class="form-footer">
{{#each buttons}}
  <button type="{{#if type}}{{type}}{{else}}button{{/if}}"{{#if name}} name="{{name}}"{{/if}}{{#if action}} data-action="{{action}}"{{/if}} class="{{cssClass}}"{{#if disabled}} disabled{{/if}}>
    {{#if icon}}<i class="{{icon}}"></i>{{/if}}{{#if label}}<span>{{localize label}}</span>{{/if}}
  </button>
{{/each}}
</footer>`,
  "templates/generic/tab-navigation.hbs": `<nav class="tabs {{navCssClass}}">
{{#each tabs}}
  <a class="{{cssClass}}" data-action="tab" data-group="{{group}}" data-tab="{{id}}">
    {{#if icon}}<i class="{{icon}}"></i>{{/if}}{{#if label}}<span>{{localize label}}</span>{{/if}}
  </a>
{{/each}}
</nav>`,
});
