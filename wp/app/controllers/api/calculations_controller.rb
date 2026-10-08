module Api
  class CalculationsController < ApplicationController
    def create
      type = params[:type].to_s
      unless WealthCalculator::CALCULATOR_TYPES.include?(type)
        return render json: { error: "Invalid calculator type" }, status: :unprocessable_entity
      end
      inputs = params[:inputs].is_a?(ActionController::Parameters) ? params[:inputs].to_unsafe_h : (params[:inputs] || {})
      result = WealthCalculator.calculate(type, inputs)
      render json: { type: type, inputs: inputs, result: result }
    rescue => e
      render json: { error: e.message }, status: :unprocessable_entity
    end
  end
end
