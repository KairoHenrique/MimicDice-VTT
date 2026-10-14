!include MUI2.nsh
!include nsDialogs.nsh

!define MUI_BGCOLOR "09090B"
!define MUI_TEXTCOLOR "FAFAFA"
!define LANG_ID_PORTUGUESE_BR 1046
!define LANG_ID_SPANISH 1034

!ifndef BUILD_UNINSTALLER
  # Replaces electron-builder's check after the old version's uninstaller ran, then clears what a broken
  # or unregistered install left behind. Only Electron's own files are removed, and only when the folder
  # holds a MimicDice install (resources\client\index.html), because the user may have picked any folder.
  !macro customUnInstallCheck
    ${If} ${Errors}
      DetailPrint "Old version uninstaller could not be started."
    ${ElseIf} $R0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
      SetErrorLevel 2
      Quit
    ${EndIf}
    ClearErrors
    !insertmacro removeStaleInstallFiles
  !macroend

  !macro removeStaleInstallFiles
    ${If} ${FileExists} "$INSTDIR\resources\client\index.html"
      DetailPrint "Removing files from the previous version..."
      RMDir /r "$INSTDIR\resources"
      RMDir /r "$INSTDIR\locales"
      Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      Delete "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
      Delete "$INSTDIR\uninstallerIcon.ico"
      Delete "$INSTDIR\chrome_100_percent.pak"
      Delete "$INSTDIR\chrome_200_percent.pak"
      Delete "$INSTDIR\resources.pak"
      Delete "$INSTDIR\icudtl.dat"
      Delete "$INSTDIR\snapshot_blob.bin"
      Delete "$INSTDIR\v8_context_snapshot.bin"
      Delete "$INSTDIR\d3dcompiler_47.dll"
      Delete "$INSTDIR\dxcompiler.dll"
      Delete "$INSTDIR\dxil.dll"
      Delete "$INSTDIR\ffmpeg.dll"
      Delete "$INSTDIR\libEGL.dll"
      Delete "$INSTDIR\libGLESv2.dll"
      Delete "$INSTDIR\vk_swiftshader.dll"
      Delete "$INSTDIR\vk_swiftshader_icd.json"
      Delete "$INSTDIR\vulkan-1.dll"
      Delete "$INSTDIR\LICENSE.electron.txt"
      Delete "$INSTDIR\LICENSES.chromium.html"
      ClearErrors
    ${EndIf}
  !macroend

  Var desktopShortcutCheckbox
  Var createDesktopShortcut

  !macro customWelcomePage
    !insertmacro MUI_PAGE_WELCOME
  !macroend

  !macro customPageAfterChangeDir
    Page custom desktopShortcutPageShow desktopShortcutPageLeave
  !macroend

  !macro customFinishPage
    Function StartApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW finishPageShow
    !insertmacro MUI_PAGE_FINISH

    # Themed checkboxes ignore SetCtlColors, so the run option would be dark text on the dark page.
    Function finishPageShow
      System::Call 'UxTheme::SetWindowTheme(p $mui.FinishPage.Run, w " ", w " ")'
      SetCtlColors $mui.FinishPage.Run "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
    FunctionEnd
  !macroend

  Function desktopShortcutPageShow
    ${If} $LANGUAGE == ${LANG_ID_PORTUGUESE_BR}
      !insertmacro MUI_HEADER_TEXT "Atalhos" "Escolha como você quer abrir o ${PRODUCT_NAME}."
      StrCpy $1 "O ${PRODUCT_NAME} sempre aparece no Menu Iniciar. Marque abaixo se também quiser um ícone na Área de Trabalho."
      StrCpy $2 "Criar atalho na Área de Trabalho"
    ${ElseIf} $LANGUAGE == ${LANG_ID_SPANISH}
      !insertmacro MUI_HEADER_TEXT "Accesos directos" "Elige cómo quieres abrir ${PRODUCT_NAME}."
      StrCpy $1 "${PRODUCT_NAME} siempre aparece en el menú Inicio. Marca la casilla si también quieres un icono en el Escritorio."
      StrCpy $2 "Crear acceso directo en el Escritorio"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose how you want to open ${PRODUCT_NAME}."
      StrCpy $1 "${PRODUCT_NAME} is always added to the Start Menu. Check the box below if you also want an icon on the Desktop."
      StrCpy $2 "Create a Desktop shortcut"
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u $1
    Pop $0
    ${NSD_CreateCheckbox} 0 32u 100% 12u $2
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
  ${IfNot} ${isUpdated}
    WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${EndIf}
!macroend
