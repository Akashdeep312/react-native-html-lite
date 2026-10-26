cmake_minimum_required(VERSION 3.13)
project(HtmlLite)

add_library(
    react-native-html-lite STATIC
    ../cpp/HtmlLiteImpl.cpp
    ../cpp/HtmlParser.cpp
)

set_target_properties(
    react-native-html-lite PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
)

target_include_directories(
    react-native-html-lite PUBLIC
    ../cpp
)

target_link_libraries(
    react-native-html-lite jsi
    reactnative
    react_codegen_HtmlLiteSpec
)
