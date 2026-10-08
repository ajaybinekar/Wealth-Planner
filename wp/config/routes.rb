Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    post "calculate", to: "calculations#create"
    post "parse_retirement_file", to: "file_uploads#create"
  end
end
