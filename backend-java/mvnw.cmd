@REM ----------------------------------------------------------------------------
@REM Maven Wrapper Batch Script for Windows
@REM ----------------------------------------------------------------------------
@echo off
setlocal

set "DIRNAME=%~dp0"
if "%DIRNAME%"=="" set "DIRNAME=."
if "%DIRNAME:~-1%"=="\" set "DIRNAME=%DIRNAME:~0,-1%"
set "MAVEN_PROJECTBASEDIR=%DIRNAME%"

if not "%JAVA_HOME%"=="" (
    set "JAVACMD=%JAVA_HOME%\bin\java.exe"
) else (
    set "JAVACMD=java"
)

set "WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.jar"
set "WRAPPER_PROPERTIES=%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.properties"

if exist "%WRAPPER_JAR%" goto runMaven

where mvn >nul 2>&1
if %ERRORLEVEL% equ 0 (
    mvn %*
    goto end
)

echo [INFO] Maven wrapper jar not found. Attempting to download Apache Maven wrapper...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $url = 'https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar'; Invoke-WebRequest -Uri $url -OutFile '%WRAPPER_JAR%' }"

if exist "%WRAPPER_JAR%" goto runMaven

echo [ERROR] Could not find or download maven-wrapper.jar. Please install Maven or configure PATH.
exit /b 1

:runMaven
"%JAVACMD%" -classpath "%WRAPPER_JAR%" "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR%" org.apache.maven.wrapper.MavenWrapperMain %*

:end
exit /b %ERRORLEVEL%
