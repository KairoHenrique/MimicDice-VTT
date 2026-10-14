!include MUI2.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
  Var desktopShortcutCheckbox
  Var createDesktopShortcut

  !macro customPageAfterChangeDir
    Page custom desktopShortcutPageShow desktopShortcutPageLeave
  !macroend

  Function desktopShortcutPageShow
    !insertmacro MUI_HEADER_TEXT "Atalhos" "Escolha como você quer abrir o ${PRODUCT_NAME}."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "O ${PRODUCT_NAME} sempre aparece no Menu Iniciar. Marque abaixo se também quiser um ícone na Área de Trabalho."
    Pop $0
    ${NSD_CreateCheckbox} 0 32u 100% 12u "Criar atalho na Área de Trabalho"
    Pop $desktopShortcutCheckbox
    ${If} $createDesktopShortcut != ${BST_UNCHECKED}
      ${NSD_Check} $desktopShortcutCheckbox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function desktopShortcutPageLeave
    ${NSD_GetState} $desktopShortcutCheckbox $createDesktopShortcut
  FunctionEnd

  !macro customInstall
    ${If} $createDesktopShortcut != ${BST_UNCHECKED}
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ${EndIf}
  !macroend
!endif

!macro customUnInstall
  ${ifNot} ${isUpdated}
    WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${endIf}
!macroend
