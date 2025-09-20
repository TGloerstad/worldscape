library(shiny)
library(shinyjs)

# Load necessary libraries
library(geodata)
# renv::init()  # Remove or comment out this line if not needed

library(assignR)
library(terra)
library(dplyr)
library(tidyr)
#library(magick)
library(cowplot)
library(readxl)
library(tibble)
#library(tidyterra)

# Add debugging message
cat("Starting mapping code execution...\n")

# Source the 2024ForLoop.R file, which defines run_mapping_code()
source('2024ForLoop.R', local = TRUE)

# UI
ui <- fluidPage(
  useShinyjs(),  # Initialize shinyjs
  
  # Add the logo at the top
  tags$head(
    tags$style(HTML("
      .logo {
        text-align: center;
        margin-bottom: 40px;
        margin-top: 20px;
      }
      .logo img {
        max-width: 50%;
        height: auto;
      }
    "))
  ),
  div(class = "logo",
      tags$img(src = "https://floratrace.com/wp-content/uploads/2024/05/Floratrace-Logo-removebg-preview.png",
               alt = "FloraTrace Logo")
  ),
  
  titlePanel("FloraTrace Mapping Tool"),
  
  sidebarLayout(
    sidebarPanel(
      h3("Manage Files"),
      # Display files in the input folder
      h4("Input Folder Files"),
      uiOutput("input_files"),
      # File upload control
      fileInput("file_upload", "Upload File to Input Folder",
                multiple = TRUE,
                accept = c(".xlsx", ".xls")),
      br(),
      # Display files in the output folder
      h4("Output Folder Files"),
      uiOutput("output_files"),
      actionButton("delete_button", "Delete Output Folder Files"),
      br(), br(),
      # Run button
      actionButton("run_button", "Run Mapping Code")
    ),
    mainPanel(
      # Main panel can be used for additional outputs if needed
      h3("Instructions"),
      p("Use the file upload control to upload Excel files to the input folder."),
      p("When you upload new files, any existing files in the input folder will be deleted."),
      p("Click 'Run Mapping Code' to execute the mapping code."),
      p("The output files will be displayed in the 'Output Folder Files' section."),
      p("Use 'Delete Output Folder Files' to clear the output folder before running new analyses.")
    )
  )
)

# Server
server <- function(input, output, session) {
  # Reactive values to track file uploads and deletions
  files_deleted <- reactiveVal(FALSE)
  
  # Function to list files in the input folder
  list_input_files <- reactive({
    if (dir.exists("input")) {
      list.files("input")
    } else {
      character(0)
    }
  })
  
  # Function to list files in the output folder
  list_output_files <- reactive({
    if (dir.exists("output")) {
      list.files("output")
    } else {
      character(0)
    }
  })
  
  # Display the list of files in the input folder
  output$input_files <- renderUI({
    files <- list_input_files()
    if (length(files) == 0) {
      HTML("<p>No files in the input folder.</p>")
    } else {
      tags$ul(
        lapply(files, function(file) {
          tags$li(file)
        })
      )
    }
  })
  
  # Display the list of files in the output folder
  output$output_files <- renderUI({
    files <- list_output_files()
    if (length(files) == 0) {
      HTML("<p>No files in the output folder.</p>")
    } else {
      tags$ul(
        lapply(files, function(file) {
          tags$li(file)
        })
      )
    }
  })
  
  # Handle file uploads
  observeEvent(input$file_upload, {
    req(input$file_upload)  # Ensure a file is uploaded
    files <- input$file_upload
    dir.create("input", showWarnings = FALSE)  # Create input folder if it doesn't exist
    
    # Delete existing files in the input folder
    existing_files <- list.files("input", full.names = TRUE)
    if (length(existing_files) > 0) {
      file.remove(existing_files)
    }
    
    # Loop through uploaded files and save them to the input folder
    for (i in 1:nrow(files)) {
      file_name <- files$name[i]
      file_path <- files$datapath[i]
      file.copy(from = file_path, to = file.path("input", file_name), overwrite = TRUE)
    }
    
    # Update the input files display
    output$input_files <- renderUI({
      files <- list_input_files()
      if (length(files) == 0) {
        HTML("<p>No files in the input folder.</p>")
      } else {
        tags$ul(
          lapply(files, function(file) {
            tags$li(file)
          })
        )
      }
    })
  })
  
  # Observe the delete button for output folder
  observeEvent(input$delete_button, {
    # Check if the output directory exists
    if (dir.exists("output")) {
      # Use unlink() to remove the entire directory, including subdirectories and files
      unlink("output", recursive = TRUE)
      
      # Recreate the empty output directory
      dir.create("output")
    } else {
      dir.create("output")
    }
    
    # Update the reactive value
    files_deleted(TRUE)
    
    # Update the output files display
    output$output_files <- renderUI({
      HTML("<p>All files have been deleted from the output folder.</p>")
    })
  })
  
  # Observe the run button
  observeEvent(input$run_button, {
    # Disable the run button to prevent multiple clicks
    disable("run_button")
    
    # Run your mapping code
    # You can add progress messages or a progress bar here if desired
    run_mapping_code()  # Call the function from 2024ForLoop.R
    
    # Re-enable the run button after execution
    enable("run_button")
    
    # Update the output files display
    output$output_files <- renderUI({
      files <- list_output_files()
      if (length(files) == 0) {
        HTML("<p>No files in the output folder.</p>")
      } else {
        tags$ul(
          lapply(files, function(file) {
            tags$li(file)
          })
        )
      }
    })
  })
}

# Run the app
shinyApp(ui = ui, server = server)